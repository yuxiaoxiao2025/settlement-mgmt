"""结算书生成：封面 + 目录 + 合并 PDF。"""
import io
import math
from datetime import datetime
from pathlib import Path
from typing import List, Tuple
from sqlalchemy.orm import Session

from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.units import cm
from pypdf import PdfReader, PdfWriter

from app.config import settings
from app.core.paths import safe_join
from app.models import Project, Item, File, SettlementLog


# 中文字体：正文宋体（SimSun），标题黑体（SimHei）
# Windows 系统字体；非 Windows 平台回退到内置 STSong-Light
def _register_cn_fonts() -> tuple[str, str]:
    """注册中文字体，返回 (body_font, heading_font)。"""
    if sys.platform.startswith("win"):
        candidates = [
            ("SimSun", r"C:\Windows\Fonts\simsun.ttc"),
            ("SimHei", r"C:\Windows\Fonts\simhei.ttf"),
        ]
    else:
        # Linux/macOS: 尝试常见路径
        candidates = [
            ("SimSun", "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc"),
            ("SimHei", "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc"),
        ]
    body_font = "Helvetica"
    heading_font = "Helvetica-Bold"
    for name, path in candidates:
        if Path(path).exists():
            try:
                pdfmetrics.registerFont(TTFont(name, path))
                if name == "SimSun":
                    body_font = "SimSun"
                elif name == "SimHei":
                    heading_font = "SimHei"
            except Exception as e:
                print(f"[FONT] 注册 {name} 失败: {e}")
    # 如果 SimSun 注册失败，回退到 reportlab 内置 CID 字体
    if body_font == "Helvetica":
        try:
            from reportlab.pdfbase.cidfonts import UnicodeCIDFont
            pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
            body_font = "STSong-Light"
        except Exception:
            pass
    return body_font, heading_font


import sys  # noqa: E402

CHINESE_FONT, HEADING_FONT = _register_cn_fonts()
print(f"[FONT] 结算书字体：正文={CHINESE_FONT}, 标题={HEADING_FONT}")


# 每个 TOC 页能容纳的条目数（A4 / 0.6cm 行高 ≈ 38 条/页，保守取 35）
ITEMS_PER_TOC_PAGE = 35


def _count_item_pages(reader: PdfReader) -> int:
    """读 PDF 页数（失败返回 0）。"""
    try:
        return len(reader.pages)
    except Exception:
        return 0


def _draw_cover(c: canvas.Canvas, project: Project, total_pages: int) -> int:
    """绘制封面页，返回页数（通常 1）。"""
    width, height = A4

    # 标题（黑体，加粗）
    c.setFont(HEADING_FONT, 28)
    title = project.name or "未命名项目"
    c.drawCentredString(width / 2, height - 4 * cm, title)

    # 副标题（黑体）
    c.setFont(HEADING_FONT, 20)
    c.drawCentredString(width / 2, height - 6 * cm, "项目结算资料交接清单")

    # 元信息（宋体）
    c.setFont(CHINESE_FONT, 12)
    info_lines = [
        f"移交日期：{project.handover_date.isoformat() if project.handover_date else '—'}",
        f"截止日期：{project.deadline.isoformat() if project.deadline else '—'}",
        f"建设管理单位：{project.construction_unit or '—'}",
        f"移交人：{project.handover_person or '—'}",
        f"接收单位：{project.receiving_unit or '—'}",
        f"接收人：{project.receiving_person or '—'}",
        f"生成时间：{datetime.now().strftime('%Y-%m-%d %H:%M')}",
        f"资料总页数：{total_pages}",
    ]
    y = height - 9 * cm
    for line in info_lines:
        c.drawString(3 * cm, y, line)
        y -= 0.8 * cm

    c.showPage()
    return 1


def _draw_toc(c: canvas.Canvas, items: List[Tuple[Item, int]]) -> int:
    """绘制目录页。

    items: [(item, start_page), ...]
    返回生成的页数。
    """
    width, height = A4
    c.setFont(HEADING_FONT, 18)  # 目录标题用黑体
    c.drawString(2 * cm, height - 2 * cm, "目录")

    c.setFont(CHINESE_FONT, 10)
    # 表头
    y = height - 3.5 * cm
    c.drawString(2 * cm, y, "序号")
    c.drawString(3.5 * cm, y, "资料名称")
    c.drawString(11 * cm, y, "页数")
    c.drawString(13 * cm, y, "起始页")
    c.drawString(15.5 * cm, y, "提交说明")
    y -= 0.5 * cm
    c.line(2 * cm, y, 19 * cm, y)
    y -= 0.5 * cm

    for item, start_page in items:
        if y < 2 * cm:
            c.showPage()
            y = height - 2 * cm
            c.setFont(CHINESE_FONT, 10)
        c.drawString(2 * cm, y, str(item.seq))
        c.drawString(3.5 * cm, y, (item.name or "")[:30])
        c.drawString(11 * cm, y, str(item.pages or "—"))
        c.drawString(13 * cm, y, str(start_page))
        desc = (item.description or "")[:30]
        c.drawString(15.5 * cm, y, desc)
        y -= 0.6 * cm

    c.showPage()
    return 1


def _compute_toc_pages(items: List[Item]) -> int:
    """按条目数估算目录页数（与 _draw_toc 内部布局一致）。"""
    if not items:
        return 1
    # 实际 _draw_toc 每页 = 表头 + 行(每条 0.6cm)。保守按 35 条/页。
    return max(1, math.ceil(len(items) / ITEMS_PER_TOC_PAGE))


def build_settlement(db: Session, project_id: str, requester_ip: str = "") -> SettlementLog:
    """生成结算书。"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise LookupError("项目不存在")

    items = (
        db.query(Item)
        .filter(Item.project_id == project_id)
        .order_by(Item.seq)
        .all()
    )
    not_confirmed = [i.name for i in items if i.status != "confirmed"]
    if not_confirmed:
        raise ValueError(f"以下项未确认：{', '.join(not_confirmed)}")

    # 创建日志
    log = SettlementLog(
        project_id=project_id,
        status="running",
        requester_ip=requester_ip,
    )
    db.add(log)
    db.commit()
    db.refresh(log)

    try:
        # 1) 先估算目录页数，决定每项起始页
        cover_pages = 1
        toc_pages = _compute_toc_pages(items)
        content_start = cover_pages + toc_pages + 1  # 第一个内容项的起始页

        # 2) 构建内容 PDF（不带封面/目录）
        content_writer = PdfWriter()
        item_page_map: List[Tuple[Item, int]] = []
        current_page = content_start

        for item in items:
            primary = next((f for f in item.files if f.is_primary), None)
            if not primary:
                primary = next((f for f in item.files if f.is_pdf), None)
            if not primary:
                # 无 PDF 文件 — 仍占位（item_page_map 里有这一项，目录会显示但合并时跳过）
                item_page_map.append((item, current_page))
                continue

            pdf_path = Path(primary.pdf_path or primary.original_path)
            if not pdf_path.exists():
                item_page_map.append((item, current_page))
                continue

            reader = PdfReader(str(pdf_path))
            page_count = _count_item_pages(reader)
            if page_count == 0:
                item_page_map.append((item, current_page))
                continue
            start_page = current_page
            for page in reader.pages:
                content_writer.add_page(page)
                current_page += 1
            item_page_map.append((item, start_page))

        total_content_pages = current_page - content_start

        # 3) 内容写到 buffer
        content_buf = io.BytesIO()
        content_writer.write(content_buf)
        content_buf.seek(0)

        # 4) 生成封面 PDF
        cover_buf = io.BytesIO()
        cover_canvas = canvas.Canvas(cover_buf, pagesize=A4)
        _draw_cover(cover_canvas, project, total_content_pages)
        cover_canvas.save()
        cover_buf.seek(0)

        # 5) 生成目录 PDF
        toc_buf = io.BytesIO()
        toc_canvas = canvas.Canvas(toc_buf, pagesize=A4)
        _draw_toc(toc_canvas, item_page_map)
        toc_canvas.save()
        toc_buf.seek(0)

        # 6) 合并：封面 + 目录 + 内容
        final_writer = PdfWriter()
        for pdf_buf in (cover_buf, toc_buf, content_buf):
            r = PdfReader(pdf_buf)
            for page in r.pages:
                final_writer.add_page(page)

        # 7) 输出
        final_dir = safe_join(settings.PROJECTS_DIR, project_id, "final")
        final_dir.mkdir(parents=True, exist_ok=True)
        safe_name = (project.name or project_id).replace("/", "_").replace("\\", "_")[:30]
        date_str = datetime.now().strftime("%Y%m%d")
        out_path = final_dir / f"结算书_{safe_name}_{date_str}.pdf"
        with open(out_path, "wb") as f:
            final_writer.write(f)

        # 8) 更新日志
        log.status = "success"
        log.finished_at = datetime.utcnow()
        log.output_path = str(out_path)
        log.file_size = out_path.stat().st_size
        db.commit()

    except Exception as e:
        log.status = "failed"
        log.finished_at = datetime.utcnow()
        log.error = str(e)[:500]
        db.commit()
        raise

    db.refresh(log)
    return log