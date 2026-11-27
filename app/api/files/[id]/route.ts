import { NextResponse } from "next/server";
import {
  getAuthenticatedUser,
  getDriveClient,
  getOrCreateUserFolder,
  isInsideUserFolder,
} from "@/lib/drive";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const drive = getDriveClient();
    const userRootFolderId = await getOrCreateUserFolder(user.email);

    const allowed = await isInsideUserFolder(drive, id, userRootFolderId);
    if (!allowed || id === userRootFolderId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const meta = await drive.files.get({
      fileId: id,
      fields: "name, mimeType",
    });

    if (meta.data.mimeType === "application/vnd.google-apps.folder") {
      return NextResponse.json(
        { error: "Cannot download a folder directly" },
        { status: 400 }
      );
    }

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
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const drive = getDriveClient();
    const userRootFolderId = await getOrCreateUserFolder(user.email);

    const allowed = await isInsideUserFolder(drive, id, userRootFolderId);
    if (!allowed || id === userRootFolderId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    await drive.files.delete({ fileId: id });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}