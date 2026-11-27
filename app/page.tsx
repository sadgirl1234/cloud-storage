"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient, Session } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const FOLDER_MIME = "application/vnd.google-apps.folder";
const FLOWERS = ["🌸", "🌺", "🌼", "🌷", "🌻", "💐", "🪷"];

type DriveItem = {
  id: string;
  name: string;
  size?: string;
  mimeType?: string;
  createdTime?: string;
};

type Breadcrumb = {
  id: string;
  name: string;
};

type FlowerParticle = {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  rot: number;
  emoji: string;
};

function formatBytes(bytes?: string) {
  const num = Number(bytes || 0);
  if (num === 0) return "0 B";
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(num) / Math.log(1024));
  return `${(num / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Navigation & folder state
  const [activeNav, setActiveNav] = useState<"all" | "folders" | "files">("all");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string>("");

  // Files state
  const [items, setItems] = useState<DriveItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Modals: New Folder & Create Online File
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);

  const [showFileModal, setShowFileModal] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newFileContent, setNewFileContent] = useState("");
  const [creatingFile, setCreatingFile] = useState(false);

  // Flower burst particles on every click & touch
  const [flowers, setFlowers] = useState<FlowerParticle[]>([]);

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      const burstId = Date.now() + Math.random();
      const batch: FlowerParticle[] = Array.from({ length: 7 }, (_, i) => {
        const angle = (Math.PI * 2 * i) / 7 + (Math.random() - 0.5) * 0.5;
        const distance = 45 + Math.random() * 45;
        return {
          id: burstId + i,
          x: e.clientX,
          y: e.clientY,
          dx: Math.cos(angle) * distance,
          dy: Math.sin(angle) * distance - 25,
          rot: (Math.random() - 0.5) * 160,
          emoji: FLOWERS[Math.floor(Math.random() * FLOWERS.length)],
        };
      });

      setFlowers((prev) => [...prev.slice(-28), ...batch]);
      setTimeout(() => {
        const ids = new Set(batch.map((b) => b.id));
        setFlowers((prev) => prev.filter((p) => !ids.has(p.id)));
      }, 950);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const fetchFiles = useCallback(
    async (accessToken: string, folderId?: string) => {
      setLoadingFiles(true);
      const query = folderId ? `?folderId=${encodeURIComponent(folderId)}` : "";
      const res = await fetch(`/api/files${query}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data.files || []);
        setCurrentFolderId(data.currentFolderId);
        if (!folderId) {
          setBreadcrumbs([{ id: data.rootFolderId, name: "My Drive" }]);
        }
      }
      setLoadingFiles(false);
    },
    []
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
      if (data.session) fetchFiles(data.session.access_token);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
        if (newSession) {
          fetchFiles(newSession.access_token);
        } else {
          setItems([]);
          setBreadcrumbs([]);
        }
      }
    );

    return () => listener.subscription.unsubscribe();
  }, [fetchFiles]);

  const handleGoogleLogin = async () => {
    setAuthLoading(true);
    setAuthMessage("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setAuthMessage(error.message);
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const openFolder = (folder: DriveItem) => {
    if (!session) return;
    setBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
    fetchFiles(session.access_token, folder.id);
  };

  const navigateBreadcrumb = (index: number) => {
    if (!session) return;
    const target = breadcrumbs[index];
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
    fetchFiles(session.access_token, target.id);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected || !session) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", selected);
    if (currentFolderId) formData.append("folderId", currentFolderId);

    const res = await fetch("/api/files", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: formData,
    });

    if (res.ok) {
      await fetchFiles(session.access_token, currentFolderId);
    } else {
      alert("Upload failed. Make sure the file is under 4 MB on Vercel.");
    }
    setUploading(false);
    e.target.value = "";
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !newFolderName.trim()) return;

    setCreatingFolder(true);
    const res = await fetch("/api/files", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        action: "create_folder",
        name: newFolderName.trim(),
        parentId: currentFolderId,
      }),
    });

    if (res.ok) {
      setNewFolderName("");
      setShowFolderModal(false);
      await fetchFiles(session.access_token, currentFolderId);
    } else {
      alert("Could not create folder.");
    }
    setCreatingFolder(false);
  };

  const handleCreateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !newFileName.trim()) return;

    setCreatingFile(true);
    const res = await fetch("/api/files", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        action: "create_file",
        name: newFileName.trim(),
        content: newFileContent,
        parentId: currentFolderId,
      }),
    });

    if (res.ok) {
      setNewFileName("");
      setNewFileContent("");
      setShowFileModal(false);
      await fetchFiles(session.access_token, currentFolderId);
    } else {
      alert("Could not save file online.");
    }
    setCreatingFile(false);
  };

  const handleDownload = async (file: DriveItem) => {
    if (!session) return;
    const res = await fetch(`/api/files/${file.id}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) {
      alert("Download failed.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (item: DriveItem) => {
    if (!session) return;
    const label = item.mimeType === FOLDER_MIME ? "folder and its contents" : "file";
    if (!confirm(`Delete this ${label}: "${item.name}"?`)) return;

    const res = await fetch(`/api/files/${item.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) {
      setItems((prev) => prev.filter((f) => f.id !== item.id));
    }
  };

  const flowerOverlay = (
    <>
      <style>{`
        @keyframes flowerBurst {
          0% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(0.4) rotate(0deg);
          }
          50% {
            opacity: 1;
            transform: translate(calc(-50% + var(--dx) * 0.7), calc(-50% + var(--dy) * 0.7)) scale(1.25) rotate(calc(var(--rot) * 0.6));
          }
          100% {
            opacity: 0;
            transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0.8) rotate(var(--rot));
          }
        }
        .flower-particle {
          position: fixed;
          pointer-events: none;
          z-index: 9999;
          font-size: 22px;
          user-select: none;
          animation: flowerBurst 0.9s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
      `}</style>
      {flowers.map((f) => (
        <span
          key={f.id}
          className="flower-particle"
          style={
            {
              left: f.x,
              top: f.y,
              "--dx": `${f.dx}px`,
              "--dy": `${f.dy}px`,
              "--rot": `${f.rot}deg`,
            } as React.CSSProperties
          }
        >
          {f.emoji}
        </span>
      ))}
    </>
  );

  if (!authReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-rose-50 text-slate-600 flex flex-col items-center justify-between p-6">
        {flowerOverlay}
        <div className="my-auto text-sm font-medium">Loading CloudVault...</div>
        <footer className="text-xs text-slate-500">made with Love</footer>
      </div>
    );
  }

  // Light & Colorful Google-only Login Screen
  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-100 via-indigo-50 to-pink-100 text-slate-800 flex flex-col justify-between p-4">
        {flowerOverlay}
        <div className="my-auto mx-auto w-full max-w-md bg-white/90 backdrop-blur-md border border-white shadow-xl shadow-indigo-100/70 rounded-3xl p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-tr from-sky-500 via-indigo-500 to-pink-500 flex items-center justify-center text-3xl shadow-md">
            ☁️
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-sky-600 via-indigo-600 to-pink-600 bg-clip-text text-transparent mb-2">
            CloudVault
          </h1>
          <p className="text-sm text-slate-500 mb-8">
            Sign in with Google to open your private, colorful cloud workspace
          </p>

          {authMessage && (
            <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-xl p-3 mb-4">
              {authMessage}
            </p>
          )}

          <button
            type="button"
            disabled={authLoading}
            onClick={handleGoogleLogin}
            className="w-full bg-white hover:bg-slate-50 border border-slate-200 shadow-sm text-slate-800 text-sm font-semibold py-3.5 rounded-xl flex items-center justify-center gap-3 transition cursor-pointer"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
              />
              <path
                fill="#34A853"
                d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.565 24 12.255 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 000 10.76l3.98-3.09z"
              />
              <path
                fill="#EA4335"
                d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.69 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
              />
            </svg>
            {authLoading ? "Redirecting..." : "Continue with Google"}
          </button>
        </div>

        <footer className="text-center text-xs font-medium text-slate-500 py-3">
          made with Love
        </footer>
      </div>
    );
  }

  // Filter items based on navigation pane selection
  const visibleItems = items.filter((item) => {
    const isFolder = item.mimeType === FOLDER_MIME;
    if (activeNav === "folders") return isFolder;
    if (activeNav === "files") return !isFolder;
    return true;
  });

  const totalBytes = items.reduce((sum, f) => sum + Number(f.size || 0), 0);
  const usedGB = (totalBytes / 1024 ** 3).toFixed(2);
  const usedPercent = Math.min((totalBytes / (15 * 1024 ** 3)) * 100, 100);

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-rose-50 text-slate-800 flex flex-col">
      {flowerOverlay}

      <div className="flex flex-1">
        {/* Left Navigation Pane */}
        <aside
          className={`${
            mobileNavOpen ? "fixed inset-y-0 left-0 z-40 flex" : "hidden"
          } md:flex w-64 bg-white/90 backdrop-blur-md border-r border-indigo-100 p-6 flex-col justify-between shadow-sm`}
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-xl font-extrabold bg-gradient-to-r from-sky-600 via-indigo-600 to-pink-600 bg-clip-text text-transparent">
                ☁️ CloudVault
              </h1>
              <button
                onClick={() => setMobileNavOpen(false)}
                className="md:hidden text-slate-400 hover:text-slate-700 text-lg"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-500 truncate mb-6">
              {session.user.email}
            </p>

            {/* Quick Actions */}
            <div className="space-y-2 mb-6">
              <button
                onClick={() => {
                  setShowFolderModal(true);
                  setMobileNavOpen(false);
                }}
                className="w-full bg-gradient-to-r from-amber-400 to-orange-400 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-semibold py-2.5 px-3 rounded-xl shadow-sm transition cursor-pointer"
              >
                📁 + New Folder
              </button>
              <button
                onClick={() => {
                  setShowFileModal(true);
                  setMobileNavOpen(false);
                }}
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white text-xs font-semibold py-2.5 px-3 rounded-xl shadow-sm transition cursor-pointer"
              >
                ✍️ + Create File Online
              </button>
            </div>

            {/* Navigation Links */}
            <nav className="space-y-1.5 text-sm">
              <button
                onClick={() => {
                  setActiveNav("all");
                  if (breadcrumbs.length > 0) navigateBreadcrumb(0);
                  setMobileNavOpen(false);
                }}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl font-medium transition cursor-pointer ${
                  activeNav === "all"
                    ? "bg-indigo-50 text-indigo-700 border border-indigo-100"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                🏠 My Drive
              </button>
              <button
                onClick={() => {
                  setActiveNav("folders");
                  setMobileNavOpen(false);
                }}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl font-medium transition cursor-pointer ${
                  activeNav === "folders"
                    ? "bg-amber-50 text-amber-700 border border-amber-100"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                📂 Folders Only
              </button>
              <button
                onClick={() => {
                  setActiveNav("files");
                  setMobileNavOpen(false);
                }}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl font-medium transition cursor-pointer ${
                  activeNav === "files"
                    ? "bg-pink-50 text-pink-700 border border-pink-100"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                📄 Files Only
              </button>
            </nav>
          </div>

          <div className="space-y-4">
            <div className="bg-gradient-to-br from-sky-50 to-indigo-50 border border-indigo-100 rounded-2xl p-4">
              <div className="flex justify-between text-xs text-slate-600 font-medium mb-2">
                <span>Folder Usage</span>
                <span>{usedGB} GB</span>
              </div>
              <div className="w-full bg-white h-2.5 rounded-full overflow-hidden border border-indigo-100">
                <div
                  className="bg-gradient-to-r from-sky-500 via-indigo-500 to-pink-500 h-full transition-all"
                  style={{ width: `${Math.max(usedPercent, 4)}%` }}
                />
              </div>
            </div>

            <button
              onClick={handleSignOut}
              className="w-full text-xs font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 py-2.5 rounded-xl transition cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </aside>

        {/* Main Workspace */}
        <main className="flex-1 p-5 md:p-10 max-w-5xl mx-auto w-full">
          <header className="flex flex-wrap justify-between items-center gap-4 mb-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileNavOpen(true)}
                className="md:hidden bg-white border border-slate-200 px-3 py-2 rounded-xl text-sm shadow-sm"
              >
                ☰
              </button>
              <div>
                <h2 className="text-2xl font-bold text-slate-800">
                  My Cloud Workspace
                </h2>
                <p className="text-xs text-slate-500">
                  Signed in as {session.user.email}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => setShowFolderModal(true)}
                className="bg-amber-100 hover:bg-amber-200 text-amber-800 text-xs font-semibold px-3.5 py-2.5 rounded-xl transition cursor-pointer"
              >
                📁 New Folder
              </button>
              <button
                onClick={() => setShowFileModal(true)}
                className="bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-xs font-semibold px-3.5 py-2.5 rounded-xl transition cursor-pointer"
              >
                ✍️ Create File
              </button>
              <label className="bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm cursor-pointer transition">
                {uploading ? "Uploading..." : "⬆️ Upload File"}
                <input
                  type="file"
                  onChange={handleUpload}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
            </div>
          </header>

          {/* Breadcrumb Path Bar */}
          <div className="flex items-center flex-wrap gap-1.5 bg-white/80 border border-indigo-100 rounded-2xl px-4 py-2.5 mb-6 text-sm shadow-xs">
            {breadcrumbs.map((crumb, idx) => (
              <div key={crumb.id} className="flex items-center gap-1.5">
                {idx > 0 && <span className="text-slate-400">/</span>}
                <button
                  onClick={() => navigateBreadcrumb(idx)}
                  className={`px-2 py-0.5 rounded-lg transition cursor-pointer ${
                    idx === breadcrumbs.length - 1
                      ? "font-bold text-indigo-700 bg-indigo-50"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {idx === 0 ? "🏠 " : "📁 "}
                  {crumb.name}
                </button>
              </div>
            ))}
          </div>

          {/* Files & Folders Table */}
          <div className="bg-white/90 border border-indigo-100 rounded-3xl shadow-sm overflow-hidden">
            <div className="grid grid-cols-12 px-5 py-3.5 bg-gradient-to-r from-sky-50/80 via-indigo-50/80 to-pink-50/80 border-b border-indigo-100 text-xs font-bold text-slate-500 uppercase">
              <div className="col-span-6">Name</div>
              <div className="col-span-2">Size</div>
              <div className="col-span-2">Created</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>

            {loadingFiles ? (
              <div className="p-10 text-center text-sm text-slate-400">
                Loading your private space...
              </div>
            ) : visibleItems.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-400">
                This folder is empty. Create a subfolder, write a file online, or upload one!
              </div>
            ) : (
              visibleItems.map((item) => {
                const isFolder = item.mimeType === FOLDER_MIME;
                return (
                  <div
                    key={item.id}
                    className="grid grid-cols-12 items-center px-5 py-4 border-b border-slate-100 last:border-0 hover:bg-sky-50/40 transition text-sm"
                  >
                    <div className="col-span-6 font-medium text-slate-800 truncate pr-4">
                      {isFolder ? (
                        <button
                          onClick={() => openFolder(item)}
                          className="text-left hover:text-indigo-600 font-semibold flex items-center gap-2 cursor-pointer"
                        >
                          <span className="text-lg">📁</span>
                          <span className="truncate">{item.name}</span>
                        </button>
                      ) : (
                        <span className="flex items-center gap-2">
                          <span className="text-lg">📄</span>
                          <span className="truncate">{item.name}</span>
                        </span>
                      )}
                    </div>
                    <div className="col-span-2 text-slate-500 text-xs">
                      {isFolder ? "Folder" : formatBytes(item.size)}
                    </div>
                    <div className="col-span-2 text-slate-500 text-xs">
                      {item.createdTime
                        ? new Date(item.createdTime).toLocaleDateString()
                        : "-"}
                    </div>
                    <div className="col-span-2 text-right space-x-3">
                      {isFolder ? (
                        <button
                          onClick={() => openFolder(item)}
                          className="text-indigo-600 hover:underline text-xs font-semibold cursor-pointer"
                        >
                          Open
                        </button>
                      ) : (
                        <button
                          onClick={() => handleDownload(item)}
                          className="text-sky-600 hover:underline text-xs font-semibold cursor-pointer"
                        >
                          Download
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(item)}
                        className="text-rose-500 hover:underline text-xs font-semibold cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </main>
      </div>

      {/* Footer */}
      <footer className="w-full py-4 text-center text-xs font-semibold text-slate-500 border-t border-indigo-100/70 bg-white/60">
        made with Love
      </footer>

      {/* Modal: Create Folder / Subfolder */}
      {showFolderModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-xl border border-indigo-100">
            <h3 className="text-lg font-bold text-slate-800 mb-1">
              📁 Create New Folder
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Will be created inside{" "}
              <span className="font-semibold text-indigo-600">
                {breadcrumbs[breadcrumbs.length - 1]?.name || "My Drive"}
              </span>
            </p>
            <form onSubmit={handleCreateFolder} className="space-y-4">
              <input
                type="text"
                required
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="e.g. College Notes, Photos, Work"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowFolderModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingFolder}
                  className="px-4 py-2 text-xs font-semibold bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-xl shadow-sm cursor-pointer"
                >
                  {creatingFolder ? "Creating..." : "Create Folder"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create File Online (Any Extension + Paste Data) */}
      {showFileModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-white rounded-3xl p-6 shadow-xl border border-indigo-100">
            <h3 className="text-lg font-bold text-slate-800 mb-1">
              ✍️ Create & Save File Online
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Type any filename with extension (like <code>notes.txt</code>,{" "}
              <code>index.html</code>, <code>code.py</code>, <code>data.json</code>)
              and paste your content below.
            </p>
            <form onSubmit={handleCreateFile} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  File Name & Extension
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder="example.txt"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-emerald-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Paste or Type Data
                </label>
                <textarea
                  rows={8}
                  value={newFileContent}
                  onChange={(e) => setNewFileContent(e.target.value)}
                  placeholder="Paste your text, code, JSON, or notes here..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-sm font-mono focus:outline-none focus:border-emerald-400"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowFileModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingFile}
                  className="px-5 py-2 text-xs font-semibold bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl shadow-sm cursor-pointer"
                >
                  {creatingFile ? "Saving..." : "Save Online"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}