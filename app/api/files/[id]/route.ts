import { NextResponse } from "next/server";
import { getDriveClient } from "@/lib/drive";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const drive = getDriveClient();

    const meta = await drive.files.get({
      fileId: id,
      fields: "name, mimeType",
    });

    const fileRes = await drive.files.get(
      { fileId: id, alt: "media" },
      { responseType: "arraybuffer" }
    );

    const fileName = meta.data.name || "download";
    const mimeType = meta.data.mimeType || "application/octet-stream";

    return new NextResponse(fileRes.data as ArrayBuffer, {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
      },
    });
  } catch (error) {
    console.error("Download error:", error);
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const drive = getDriveClient();

    await drive.files.delete({ fileId: id });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}