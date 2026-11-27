import { NextResponse } from "next/server";
import { Readable } from "stream";
import {
  getAuthenticatedUser,
  getDriveClient,
  getOrCreateUserFolder,
  isInsideUserFolder,
} from "@/lib/drive";

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const drive = getDriveClient();
    const userRootFolderId = await getOrCreateUserFolder(user.email);

    const { searchParams } = new URL(req.url);
    const requestedFolderId = searchParams.get("folderId") || userRootFolderId;

    const allowed = await isInsideUserFolder(
      drive,
      requestedFolderId,
      userRootFolderId
    );
    if (!allowed) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const res = await drive.files.list({
      q: `'${requestedFolderId}' in parents and trashed = false`,
      fields: "files(id, name, size, mimeType, createdTime)",
      orderBy: "folder,createdTime desc",
    });

    return NextResponse.json({
      files: res.data.files || [],
      rootFolderId: userRootFolderId,
      currentFolderId: requestedFolderId,
    });
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

    const drive = getDriveClient();
    const userRootFolderId = await getOrCreateUserFolder(user.email);
    const contentType = req.headers.get("content-type") || "";

    // JSON requests: create folder OR create file with pasted text
    if (contentType.includes("application/json")) {
      const body = await req.json();
      const targetFolderId = body.parentId || userRootFolderId;

      const allowed = await isInsideUserFolder(
        drive,
        targetFolderId,
        userRootFolderId
      );
      if (!allowed) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }

      if (body.action === "create_folder") {
        const folderName = String(body.name || "").trim();
        if (!folderName) {
          return NextResponse.json(
            { error: "Folder name is required" },
            { status: 400 }
          );
        }

        const created = await drive.files.create({
          requestBody: {
            name: folderName,
            mimeType: "application/vnd.google-apps.folder",
            parents: [targetFolderId],
          },
          fields: "id, name, size, mimeType, createdTime",
        });

        return NextResponse.json({ file: created.data });
      }

      if (body.action === "create_file") {
        const fileName = String(body.name || "").trim();
        const fileContent = String(body.content ?? "");

        if (!fileName) {
          return NextResponse.json(
            { error: "File name with extension is required" },
            { status: 400 }
          );
        }

        const buffer = Buffer.from(fileContent, "utf-8");
        const created = await drive.files.create({
          requestBody: {
            name: fileName,
            parents: [targetFolderId],
          },
          media: {
            mimeType: "text/plain",
            body: Readable.from(buffer),
          },
          fields: "id, name, size, mimeType, createdTime",
        });

        return NextResponse.json({ file: created.data });
      }

      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    // Multipart upload from device
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const targetFolderId =
      (formData.get("folderId") as string) || userRootFolderId;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const allowed = await isInsideUserFolder(
      drive,
      targetFolderId,
      userRootFolderId
    );
    if (!allowed) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const res = await drive.files.create({
      requestBody: {
        name: file.name,
        parents: [targetFolderId],
      },
      media: {
        mimeType: file.type || "application/octet-stream",
        body: Readable.from(buffer),
      },
      fields: "id, name, size, mimeType, createdTime",
    });

    return NextResponse.json({ file: res.data });
  } catch (error) {
    console.error("Create/Upload error:", error);
    return NextResponse.json({ error: "Operation failed" }, { status: 500 });
  }
}