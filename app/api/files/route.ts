import { NextResponse } from "next/server";
import { Readable } from "stream";
import {
  getAuthenticatedUser,
  getDriveClient,
  getOrCreateUserFolder,
} from "@/lib/drive";

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const drive = getDriveClient();
    const userFolderId = await getOrCreateUserFolder(user.email);

    const res = await drive.files.list({
      q: `'${userFolderId}' in parents and trashed = false`,
      fields: "files(id, name, size, mimeType, createdTime)",
      orderBy: "createdTime desc",
    });

    return NextResponse.json({ files: res.data.files || [] });
  } catch (error) {
    console.error("List error:", error);
    return NextResponse.json({ error: "Failed to load files" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const drive = getDriveClient();
    const userFolderId = await getOrCreateUserFolder(user.email);

    const res = await drive.files.create({
      requestBody: {
        name: file.name,
        parents: [userFolderId],
      },
      media: {
        mimeType: file.type || "application/octet-stream",
        body: Readable.from(buffer),
      },
      fields: "id, name, size, mimeType, createdTime",
    });

    return NextResponse.json({ file: res.data });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}