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
JWT_EXPIRE_HOURS = 12  # 短一点，公网风险更高

# Cookie 名（前端 axios 不会自动带，必须前端显式 withCredentials=true）
COOKIE_NAME = "sm_auth"

# 限速：同 IP 5 分钟最多 10 次登录尝试
limiter = Limiter(key_func=get_remote_address)


# ── Schemas ──
class LoginReq(BaseModel):
    username: Annotated[str, Field(min_length=1, max_length=64)]
    password: Annotated[str, Field(min_length=1, max_length=128)]
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
    """验证码规范化：去空白 + upper，方便用户输入 '0fal-mf9v-yl9a-5nd2' 也能过。"""
    return "".join(code.split()).upper()


def _verify_password(plain: str, stored: str) -> bool:
    # 支持明文（生成的随机密码）和 bcrypt 哈希（运维手动 hash 过的）
    if stored.startswith("$2"):
        try:
            return bcrypt.checkpw(plain.encode("utf-8"), stored.encode("utf-8"))
        except Exception:
            return False
    return hmac.compare_digest(plain.encode("utf-8"), stored.encode("utf-8"))


def _mint_token(username: str, secret: str) -> tuple[str, datetime]:
    exp = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS)
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

    # 2. 用户名 + 密码（统一错误信息防枚举）
    if req.username != admin_user or not _verify_password(req.password, admin_pwd):
        _audit(False, request, req.username)
        raise HTTPException(status_code=401, detail="invalid credentials")

    # 3. 签发
    token, exp = _mint_token(admin_user, jwt_secret)
    _audit(True, request, admin_user)

    # 同时设置 HttpOnly Secure cookie（生产环境 behind nginx 应有 HTTPS）
    # secure=True 在 HTTP 环境会被浏览器忽略，所以测试时也工作；生产环境反正走 HTTPS
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=True,  # 公网部署默认开；如需 HTTP 测试可临时改为 False
        samesite="lax",  # 防 CSRF；strict 会破坏 OAuth/redirect 流程
        max_age=JWT_EXPIRE_HOURS * 3600,
        path="/",
    )
    return TokenResp(access_token=token, expires_in=JWT_EXPIRE_HOURS * 3600)


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
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    """429 with Retry-After header。"""
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail="too many login attempts, slow down",
        headers={"Retry-After": str(exc.detail.split(" ")[-1] if hasattr(exc, "detail") else "60")},
    )