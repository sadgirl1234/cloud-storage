"use client";

import { useState } from "react";

type UploadedFile = {
  id: string;
  name: string;
  size: string;
  date: string;
};

export default function Home() {
  const [files, setFiles] = useState<UploadedFile[]>([
    { id: "1", name: "Resume_2026.pdf", size: "1.4 MB", date: "Today" },
    { id: "2", name: "Project_Backup.zip", size: "42.8 MB", date: "Yesterday" },
  ]);
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setUploading(true);
    // Temporary preview until connected to Google Drive / Supabase API
    setTimeout(() => {
      const sizeInMB = (selected.size / (1024 * 1024)).toFixed(2) + " MB";
      setFiles((prev) => [
        {
          id: crypto.randomUUID(),
          name: selected.name,
          size: sizeInMB,
          date: "Just now",
        },
        ...prev,
      ]);
      setUploading(false);
    }, 500);
  };

  const handleDelete = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-zinc-800 p-6 hidden md:flex flex-col justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white mb-8">
            ☁️ CloudVault
          </h1>
          <nav className="space-y-2 text-sm">
            <div className="bg-zinc-800/80 text-white px-3 py-2 rounded-lg font-medium">
              My Drive
            </div>
            <div className="text-zinc-400 hover:text-white px-3 py-2 rounded-lg cursor-pointer">
              Recent Uploads
            </div>
            <div className="text-zinc-400 hover:text-white px-3 py-2 rounded-lg cursor-pointer">
              Shared Files
            </div>
          </nav>
        </div>

        {/* Storage Meter */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex justify-between text-xs text-zinc-400 mb-2">
            <span>Storage Used</span>
            <span>0.05 GB / 15 GB</span>
          </div>
          <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
            <div className="bg-blue-500 h-full w-[5%]" />
          </div>
        </div>
      </aside>

      {/* Main Content */}
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
              onChange={handleFileSelect}
              className="hidden"
              disabled={uploading}
            />
          </label>
        </header>

        {/* Dropzone Banner */}
        <label className="border-2 border-dashed border-zinc-800 hover:border-blue-500/60 bg-zinc-900/40 rounded-2xl p-8 mb-8 flex flex-col items-center justify-center text-center cursor-pointer transition">
          <p className="text-sm font-medium text-zinc-200">
            Click to choose a file from your device
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            Supports images, videos, PDFs, and archives
          </p>
          <input
            type="file"
            onChange={handleFileSelect}
            className="hidden"
            disabled={uploading}
          />
        </label>

        {/* File Table */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-12 px-5 py-3 border-b border-zinc-800 text-xs font-medium text-zinc-400 uppercase">
            <div className="col-span-6">File Name</div>
            <div className="col-span-2">Size</div>
            <div className="col-span-2">Uploaded</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          {files.length === 0 ? (
            <div className="p-8 text-center text-sm text-zinc-500">
              No files uploaded yet.
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
                <div className="col-span-2 text-zinc-400">{file.size}</div>
                <div className="col-span-2 text-zinc-400">{file.date}</div>
                <div className="col-span-2 text-right space-x-3">
                  <button className="text-blue-400 hover:underline text-xs">
                    Download
                  </button>
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