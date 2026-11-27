import { NextResponse } from "next/server";
import { Readable } from "stream";
import {
  getAccessToken,
  getAuthenticatedUser,
  getDriveClient,
  getOrCreateUserFolder,
  isInsideUserFolder,
} from "@/lib/drive";

const MAX_SINGLE_FILE_BYTES = 70 * 1024 * 1024; // 70 MB

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

    // 1. Start a direct resumable upload (bypasses Vercel's 4.5 MB limit)
    if (body.action === "init_upload") {
      const fileName = String(body.name || "").trim();
      const mimeType = String(body.mimeType || "application/octet-stream");
      const fileSize = Number(body.size || 0);

      if (!fileName) {
        return NextResponse.json(
          { error: "File name is required" },
          { status: 400 }
        );
      }

      if (fileSize > MAX_SINGLE_FILE_BYTES) {
        return NextResponse.json(
          { error: "File exceeds the 70 MB single-file limit" },
          { status: 400 }
        );
      }

      const accessToken = await getAccessToken();
      const origin = req.headers.get("origin") || "";

      const initRes = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": mimeType,
            "X-Upload-Content-Length": String(fileSize),
            ...(origin ? { Origin: origin } : {}),
          },
          body: JSON.stringify({
            name: fileName,
            parents: [targetFolderId],
          }),
        }
      );

      const uploadUrl = initRes.headers.get("location");
      if (!initRes.ok || !uploadUrl) {
        const errText = await initRes.text();
        console.error("Resumable init error:", errText);
        return NextResponse.json(
          { error: "Could not initialize upload" },
          { status: 500 }
        );
      }

      return NextResponse.json({ uploadUrl });
    }

    // 2. Create folder or subfolder
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

    // 3. Create any file online from pasted text
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
  } catch (error) {
    console.error("POST /api/files error:", error);
    return NextResponse.json({ error: "Operation failed" }, { status: 500 });
  }
}