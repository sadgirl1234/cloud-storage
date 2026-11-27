import { google, drive_v3 } from "googleapis";
import { createClient } from "@supabase/supabase-js";

function createOAuthClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    "https://developers.google.com/oauthplayground"
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  return oauth2Client;
}

export function getDriveClient() {
  return google.drive({ version: "v3", auth: createOAuthClient() });
}

export async function getAccessToken(): Promise<string> {
  const oauth2Client = createOAuthClient();
  const { token } = await oauth2Client.getAccessToken();
  if (!token) throw new Error("Failed to get Google access token");
  return token;
}

export async function getAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.email) return null;

  return data.user;
}

export async function getOrCreateUserFolder(email: string) {
  const drive = getDriveClient();
  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID!;
  const safeEmail = email.replace(/'/g, "\\'");

  const existing = await drive.files.list({
    q: `'${rootFolderId}' in parents and name = '${safeEmail}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id, name)",
    spaces: "drive",
  });

  if (existing.data.files && existing.data.files.length > 0) {
    return existing.data.files[0].id!;
  }

  const created = await drive.files.create({
    requestBody: {
      name: email,
      mimeType: "application/vnd.google-apps.folder",
      parents: [rootFolderId],
    },
    fields: "id",
  });

  return created.data.id!;
}

export async function isInsideUserFolder(
  drive: drive_v3.Drive,
  itemId: string,
  userRootFolderId: string
): Promise<boolean> {
  if (itemId === userRootFolderId) return true;

  let currentId: string | undefined = itemId;
  for (let depth = 0; depth < 20 && currentId; depth++) {
    const res: { data: drive_v3.Schema$File } = await drive.files.get({
      fileId: currentId,
      fields: "parents",
    });
    const parents: string[] | null | undefined = res.data.parents;
    if (!parents || parents.length === 0) return false;
    if (parents.includes(userRootFolderId)) return true;
    currentId = parents[0];
  }

  return false;
}