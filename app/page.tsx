"use client";

import { useEffect, useState } from "react";

type DriveFile = {
  id: string;
  name: string;
  size?: string;
  createdTime?: string;
};

function formatBytes(bytes?: string) {
  const num = Number(bytes || 0);
  if (num === 0) return "0 B";
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(num) / Math.log(1024));
  return `${(num / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

export default function Home() {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const fetchFiles = async () => {
    setLoading(true);
    const res = await fetch("/api/files");
    const data = await res.json();
    setFiles(data.files || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", selected);

    const res = await fetch("/api/files", {
      method: "POST",
      body: formData,
    });

    if (res.ok) {
      await fetchFiles();
    } else {
      alert("Upload failed. Check your .env.local keys and terminal logs.");
    }
    setUploading(false);
    e.target.value = "";
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/files/${id}`, { method: "DELETE" });
    if (res.ok) {
      setFiles((prev) => prev.filter((f) => f.id !== id));
    }
  };

  const totalBytes = files.reduce((sum, f) => sum + Number(f.size || 0), 0);
  const usedGB = (totalBytes / 1024 ** 3).toFixed(2);
  const usedPercent = Math.min((totalBytes / (15 * 1024 ** 3)) * 100, 100);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      <aside className="w-64 border-r border-zinc-800 p-6 hidden md:flex flex-col justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white mb-8">
            ☁️ CloudVault
          </h1>
          <nav className="space-y-2 text-sm">
            <div className="bg-zinc-800/80 text-white px-3 py-2 rounded-lg font-medium">
              My Drive
            </div>
          </nav>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex justify-between text-xs text-zinc-400 mb-2">
            <span>Storage Used</span>
            <span>{usedGB} GB / 15 GB</span>
          </div>
          <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
            <div
              className="bg-blue-500 h-full transition-all"
              style={{ width: `${Math.max(usedPercent, 2)}%` }}
            />
          </div>
        </div>
      </aside>

      <main className="flex-1 p-6 md:p-10 max-w-5xl mx-auto w-full">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl font-semibold">My Cloud Files</h2>
            <p className="text-sm text-zinc-400">
              Upload, download, and manage your private files
            </p>
          </div>

          <label className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2.5 rounded-lg cursor-pointer transition">
            {uploading ? "Uploading..." : "+ Upload File"}
            <input
              type="file"
              onChange={handleUpload}
              className="hidden"
              disabled={uploading}
            />
          </label>
        </header>

        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-12 px-5 py-3 border-b border-zinc-800 text-xs font-medium text-zinc-400 uppercase">
            <div className="col-span-6">File Name</div>
            <div className="col-span-2">Size</div>
            <div className="col-span-2">Uploaded</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-zinc-500">
              Loading files...
            </div>
          ) : files.length === 0 ? (
            <div className="p-8 text-center text-sm text-zinc-500">
              No files uploaded yet. Click &quot;+ Upload File&quot; to test.
            </div>
          ) : (
            files.map((file) => (
              <div
                key={file.id}
                className="grid grid-cols-12 items-center px-5 py-4 border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/40 transition text-sm"
              >
                <div className="col-span-6 font-medium text-zinc-100 truncate pr-4">
                  📄 {file.name}
                </div>
                <div className="col-span-2 text-zinc-400">
                  {formatBytes(file.size)}
                </div>
                <div className="col-span-2 text-zinc-400">
                  {file.createdTime
                    ? new Date(file.createdTime).toLocaleDateString()
                    : "-"}
                </div>
                <div className="col-span-2 text-right space-x-3">
                  <a
                    href={`/api/files/${file.id}`}
                    className="text-blue-400 hover:underline text-xs"
                  >
                    Download
                  </a>
                  <button
                    onClick={() => handleDelete(file.id)}
                    className="text-red-400 hover:underline text-xs"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}