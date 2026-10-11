import { NextResponse } from "next/server";
import { isMarket } from "@/lib/portfolio";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 });
  }

  const data: { name?: string; quantity?: number; averagePrice?: number; exchange?: string } = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) return NextResponse.json({ error: "Tên cổ phiếu không hợp lệ." }, { status: 400 });
    data.name = body.name.trim();
  }
  if (body.quantity !== undefined) {
    const quantity = Number(body.quantity);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) return NextResponse.json({ error: "Khối lượng phải là số nguyên dương." }, { status: 400 });
    data.quantity = quantity;
  }
  if (body.averagePrice !== undefined) {
    const averagePrice = Number(body.averagePrice);
    if (!Number.isFinite(averagePrice) || averagePrice <= 0) return NextResponse.json({ error: "Giá vốn trung bình phải lớn hơn 0." }, { status: 400 });
    data.averagePrice = averagePrice;
  }
  if (body.exchange !== undefined) {
    if (!isMarket(body.exchange)) return NextResponse.json({ error: "Sàn giao dịch không hợp lệ." }, { status: 400 });
    data.exchange = body.exchange;
  }
  if (!Object.keys(data).length) return NextResponse.json({ error: "Không có trường nào để cập nhật." }, { status: 400 });

  try {
    const holding = await prisma.holding.update({ where: { id }, data });
    return NextResponse.json({ holding });
  } catch {
    return NextResponse.json({ error: "Không tìm thấy cổ phiếu hoặc không cập nhật được." }, { status: 404 });
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const { id } = await params;
  try {
    await prisma.holding.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "Không tìm thấy cổ phiếu hoặc không xóa được." }, { status: 404 });
  }
}
