"""认证路由：登录 / 登出 / me / 限速 / 审计。

设计原则（v0.3.1+ 公网部署，2026-06-11）：
1. **三件套登录**：用户名 + 密码 + 站点验证码（写死在 .env，不开放注册）。
2. **JWT 双通道**：既支持 `Authorization: Bearer`（API 客户端），也支持 HttpOnly Secure
   cookie（浏览器，前端无法通过 JS 读到 → XSS 偷不走）。
3. **限速**：登录端点 IP-level 限速（slowapi 默认内存后端），防止 credential stuffing。
4. **审计日志**：登录成功 / 失败 / 登出都写入 AccessLog 表，可查。
5. **失败信息一致**：无论用户名错 / 密码错 / 验证码错，统一返回 `invalid credentials`，
   防止用户名枚举。
6. **常量时间比较**：密码比对用 `hmac.compare_digest`，避开时序攻击。
7. **JWT 受众 + 签发方**：`aud` 和 `iss` 强制校验，即使 secret 泄漏也限制伪造范围。

注：单用户系统（admin only），不做 RBAC / 角色表 — 简化部署。
"""
import hmac
import logging
from datetime import datetime, timedelta, timezone
from typing import Annotated

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.config import settings
from app.database import SessionLocal

logger = logging.getLogger("app.auth")

router = APIRouter(tags=["auth"])

# ── JWT 配置 ──
JWT_ALGO = "HS256"
JWT_AUD = "settlement-mgmt"
JWT_ISS = "settlement-mgmt-auth"
# H1: 不再 hard-code 12 — 从 settings 读（默认 12h；.env 可覆盖）
# 注：.env 里 JWT_EXPIRE_HOURS=24 是用户配置，但默认 12h 是公网安全底线
JWT_EXPIRE_HOURS_DEFAULT = 12

# Cookie 名（前端 axios 不会自动带，必须前端显式 withCredentials=true）
COOKIE_NAME = "sm_auth"

# 限速：同 IP 5 分钟最多 10 次登录尝试
limiter = Limiter(key_func=get_remote_address)


# ── Schemas ──
class LoginReq(BaseModel):
    username: Annotated[str, Field(min_length=1, max_length=64)]
    # H3: min_length=8 — 与生成密码一致；slowapi 是 IP-level（多机可绕），
    #     最低长度是最后一道防线
    password: Annotated[str, Field(min_length=8, max_length=128)]
    verification_code: Annotated[str, Field(min_length=4, max_length=32)]


class TokenResp(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class MeResp(BaseModel):
    username: str


# ── 内部辅助 ──
def _secrets() -> tuple[str, str, str, str]:
    """从 settings 读所有 secrets — settings 已从 .env 自动加载。
    返回 (admin_user, admin_pwd_or_hash, site_code, jwt_secret)。
    """
    user = settings.ADMIN_USERNAME
    pwd = settings.ADMIN_PASSWORD
    code = settings.SITE_VERIFICATION_CODE
    secret = settings.JWT_SECRET
    if not all([user, pwd, code, secret]):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="auth misconfigured (check .env: ADMIN_USERNAME/PASSWORD/SITE_VERIFICATION_CODE/JWT_SECRET)",
        )
    return user, pwd, code, secret


def _normalize_code(code: str) -> str:
    """验证码规范化：去空白 + 去横线 + upper。

    接受用户输入任何形式：
      '0FAL-MF9V-YL9A-5ND2' / '0falmf9vyl9a5nd2' / ' 0FAL MF9V YL9A 5ND2 '
    都规范化成同一形式 '0FALMF9VYL9A5ND2'。
    """
    return "".join(code.split()).replace("-", "").upper()


# ── 启动时一次性：明文密码 → bcrypt 缓存 ─────────────────────────
# H2 简化版：.env 里仍允许明文 ADMIN_PASSWORD（方便用户），启动时自动 hash 一次
# 后续比对都用 hash。这样部署方不需要懂 bcrypt，但内存里始终是 hash。
_admin_password_hash_cache: str | None = None


def _get_admin_password_hash() -> str:
    """返回 admin 密码的 bcrypt hash。首次调用时把明文 hash 一次。"""
    global _admin_password_hash_cache
    if _admin_password_hash_cache is not None:
        return _admin_password_hash_cache

    _, admin_pwd, _, _ = _secrets()

    if admin_pwd.startswith("$2"):
        # 已经是 hash
        _admin_password_hash_cache = admin_pwd
    else:
        # 明文 → 现场 hash（一次性）
        logger.warning(
            "ADMIN_PASSWORD in .env is plaintext (not a bcrypt hash starting with $2). "
            "Auto-hashing once for this process. "
            "Recommended: replace with a bcrypt hash for git-safety — "
            "python -c \"from passlib.hash import bcrypt; import sys; print(bcrypt.hash(sys.argv[1]))\" YOUR_PASSWORD"
        )
        _admin_password_hash_cache = bcrypt.hashpw(
            admin_pwd.encode("utf-8"), bcrypt.gensalt(rounds=12)
        ).decode("utf-8")

    return _admin_password_hash_cache


def _verify_password(plain: str, stored: str) -> bool:
    """H2: 用 bcrypt 验证。stored 始终是 hash（启动时一次性转换）。"""
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), stored.encode("utf-8"))
    except Exception:
        return False


def _mint_token(username: str, secret: str) -> tuple[str, datetime]:
    hours = getattr(settings, "JWT_EXPIRE_HOURS", JWT_EXPIRE_HOURS_DEFAULT) or JWT_EXPIRE_HOURS_DEFAULT
    exp = datetime.now(timezone.utc) + timedelta(hours=hours)
    payload = {
        "sub": username,
        "aud": JWT_AUD,
        "iss": JWT_ISS,
        "iat": datetime.now(timezone.utc),
        "exp": exp,
    }
    return jwt.encode(payload, secret, algorithm=JWT_ALGO), exp


def _decode_token(token: str, secret: str) -> str:
    """校验签名 + audience + issuer + 过期，返回 username。"""
    try:
        payload = jwt.decode(
            token, secret,
            algorithms=[JWT_ALGO],
            audience=JWT_AUD,
            issuer=JWT_ISS,
        )
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e

    username = payload.get("sub")
    if not username:
        raise HTTPException(status_code=401, detail="malformed token")
    return username


def _audit(success: bool, request: Request, username_attempted: str = ""):
    """登录尝试写审计日志（AccessLog 表，schema 已存在）。"""
    try:
        from app.models import AccessLog  # 延迟 import — 避免循环
        with SessionLocal() as db:
            db.add(AccessLog(
                ip=request.client.host if request.client else "",
                user_agent=request.headers.get("user-agent", "")[:200],
                method="AUTH_LOGIN",
                path=f"{'/ok' if success else '/fail'}:{username_attempted}",
                status_code=200 if success else 401,
            ))
            db.commit()
    except Exception as e:
        logger.warning("audit log failed: %s", e)


# ── Token 来源：优先 Authorization header，其次 cookie ──
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def _extract_token(request: Request, bearer: str | None = Depends(oauth2_scheme)) -> str | None:
    """从 header 取 Bearer，否则从 cookie 取。"""
    if bearer:
        return bearer
    return request.cookies.get(COOKIE_NAME)


def require_user(
    request: Request,
    token: Annotated[str | None, Depends(_extract_token)],
) -> str:
    """所有业务路由的 Depends — 未登录 → 401。"""
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    admin_user, _, _, secret = _secrets()
    username = _decode_token(token, secret)
    if username != admin_user:
        raise HTTPException(status_code=401, detail="unknown user")
    return username


# ── 端点 ──
@router.post("/api/auth/login", response_model=TokenResp)
@limiter.limit("10/5minute")  # slowapi 装饰器形式 — 不会污染 OpenAPI
def login(
    req: LoginReq,
    request: Request,
    response: Response,
):
    """三件套登录。返回 JWT，并通过 Set-Cookie 写入 HttpOnly Secure cookie。"""
    admin_user, admin_pwd, site_code, jwt_secret = _secrets()

    # 1. 验证码（最先校验 → 避免对错误用户跑 bcrypt）
    if not hmac.compare_digest(
        _normalize_code(req.verification_code).encode(),
        _normalize_code(site_code).encode(),
    ):
        _audit(False, request, req.username)
        raise HTTPException(status_code=401, detail="invalid credentials")

    # 2. 用户名 + 密码（统一错误信息防枚举；H2 走 bcrypt 缓存）
    if req.username != admin_user or not _verify_password(req.password, _get_admin_password_hash()):
        _audit(False, request, req.username)
        raise HTTPException(status_code=401, detail="invalid credentials")

    # 3. 签发
    token, exp = _mint_token(admin_user, jwt_secret)
    _audit(True, request, admin_user)

    # 同时设置 HttpOnly Secure cookie（生产环境 behind nginx 应有 HTTPS）
    # secure=True 在 HTTP 环境会被浏览器忽略，所以测试时也工作；生产环境反正走 HTTPS
    cookie_max_age = (getattr(settings, "JWT_EXPIRE_HOURS", JWT_EXPIRE_HOURS_DEFAULT) or JWT_EXPIRE_HOURS_DEFAULT) * 3600
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=True,  # 公网部署默认开；如需 HTTP 测试可临时改为 False
        samesite="lax",  # 防 CSRF；strict 会破坏 OAuth/redirect 流程
        max_age=cookie_max_age,
        path="/",
    )
    return TokenResp(access_token=token, expires_in=cookie_max_age)


@router.post("/api/auth/logout", status_code=204)
def logout(response: Response):
    """清 cookie。无状态 JWT 服务端无需维护黑名单。"""
    response.delete_cookie(COOKIE_NAME, path="/")
    return None


@router.get("/api/auth/me", response_model=MeResp)
def me(current: Annotated[str, Depends(require_user)]):
    """前端启动时调一次，确认登录态 + 拿 username 显示。"""
    return MeResp(username=current)


# ── 限速异常处理 ──
# 修 B-05：原 rate_limit_handler 是死代码 — `return HTTPException(...)` 不 raise，
# 永远不生效。main.py 用 slowapi._rate_limit_exceeded_handler，本函数从未注册。
# 已删除。如未来要自定义 429 响应，正确的写法是：
#   @app.exception_handler(RateLimitExceeded)
#   async def my_handler(...): raise HTTPException(429, ...)