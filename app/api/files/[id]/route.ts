import { NextResponse } from "next/server";
import {
  getAuthenticatedUser,
  getDriveClient,
  getOrCreateUserFolder,
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
    const userFolderId = await getOrCreateUserFolder(user.email);

    const meta = await drive.files.get({
      fileId: id,
      fields: "name, mimeType, parents",
    });

    // Block access if the file is not inside this user's folder
    if (!meta.data.parents?.includes(userFolderId)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
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
    const userFolderId = await getOrCreateUserFolder(user.email);

    const meta = await drive.files.get({
      fileId: id,
      fields: "parents",
    });

    // Block deletion if the file is not inside this user's folder
    if (!meta.data.parents?.includes(userFolderId)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    await drive.files.delete({ fileId: id });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}