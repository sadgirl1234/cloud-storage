"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient, Session } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);

  // Login / Sign Up form state
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Files state
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fetchFiles = useCallback(async (accessToken: string) => {
    setLoadingFiles(true);
    const res = await fetch("/api/files", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      const data = await res.json();
      setFiles(data.files || []);
    }
    setLoadingFiles(false);
  }, []);

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
          setFiles([]);
        }
      }
    );

    return () => listener.subscription.unsubscribe();
  }, [fetchFiles]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthMessage("");

    if (isSignUp) {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setAuthMessage(error.message);
      } else if (!data.session) {
        setAuthMessage(
          "Account created! Check your email to confirm, then log in."
        );
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) setAuthMessage(error.message);
    }

    setAuthLoading(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) setAuthMessage(error.message);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected || !session) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", selected);

    const res = await fetch("/api/files", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: formData,
    });

    if (res.ok) {
      await fetchFiles(session.access_token);
    } else {
      alert("Upload failed. Make sure the file is under 4 MB on Vercel.");
    }
    setUploading(false);
    e.target.value = "";
  };

  const handleDownload = async (file: DriveFile) => {
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

  const handleDelete = async (id: string) => {
    if (!session) return;
    const res = await fetch(`/api/files/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) {
      setFiles((prev) => prev.filter((f) => f.id !== id));
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-400 flex items-center justify-center">
        Loading...
      </div>
    );
  }

  // Login / Create Account screen
  if (!session) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
          <h1 className="text-2xl font-bold text-white mb-2">☁️ CloudVault</h1>
          <p className="text-sm text-zinc-400 mb-6">
            {isSignUp
              ? "Create a private account to get your own cloud folder"
              : "Sign in to access your private files"}
          </p>

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@gmail.com"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Password
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            {authMessage && (
              <p className="text-xs text-amber-400 bg-amber-950/40 border border-amber-800/60 rounded-lg p-3">
                {authMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-2.5 rounded-lg transition"
            >
              {authLoading
                ? "Please wait..."
                : isSignUp
                ? "Create Account"
                : "Sign In"}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-zinc-800" />
            <span className="text-xs text-zinc-500">OR</span>
            <div className="h-px flex-1 bg-zinc-800" />
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            className="w-full bg-white hover:bg-zinc-200 text-zinc-900 text-sm font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 transition"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
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
            Continue with Google
          </button>

          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setAuthMessage("");
            }}
            className="w-full text-center text-xs text-zinc-400 hover:text-white mt-5"
          >
            {isSignUp
              ? "Already have an account? Sign In"
              : "Don't have an account? Create Account"}
          </button>
        </div>
      </div>
    );
  }

  // Logged-in Dashboard
  const totalBytes = files.reduce((sum, f) => sum + Number(f.size || 0), 0);
  const usedGB = (totalBytes / 1024 ** 3).toFixed(2);
  const usedPercent = Math.min((totalBytes / (15 * 1024 ** 3)) * 100, 100);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      <aside className="w-64 border-r border-zinc-800 p-6 hidden md:flex flex-col justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white mb-2">
            ☁️ CloudVault
          </h1>
          <p className="text-xs text-zinc-400 truncate mb-8">
            {session.user.email}
          </p>
          <nav className="space-y-2 text-sm">
            <div className="bg-zinc-800/80 text-white px-3 py-2 rounded-lg font-medium">
              My Private Drive
            </div>
          </nav>
        </div>

        <div className="space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex justify-between text-xs text-zinc-400 mb-2">
              <span>Your Usage</span>
              <span>{usedGB} GB</span>
            </div>
            <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
              <div
                className="bg-blue-500 h-full transition-all"
                style={{ width: `${Math.max(usedPercent, 2)}%` }}
              />
            </div>
          </div>

          <button
            onClick={handleSignOut}
            className="w-full text-xs text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-700 py-2 rounded-lg transition"
          >
            Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 p-6 md:p-10 max-w-5xl mx-auto w-full">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl font-semibold">My Cloud Files</h2>
            <p className="text-sm text-zinc-400">
              Signed in as {session.user.email}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <label className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2.5 rounded-lg cursor-pointer transition">
              {uploading ? "Uploading..." : "+ Upload File"}
              <input
                type="file"
                onChange={handleUpload}
                className="hidden"
                disabled={uploading}
              />
            </label>
            <button
              onClick={handleSignOut}
              className="md:hidden text-xs text-zinc-400 border border-zinc-800 px-3 py-2.5 rounded-lg"
            >
              Sign Out
            </button>
          </div>
        </header>

        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-12 px-5 py-3 border-b border-zinc-800 text-xs font-medium text-zinc-400 uppercase">
            <div className="col-span-6">File Name</div>
            <div className="col-span-2">Size</div>
            <div className="col-span-2">Uploaded</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          {loadingFiles ? (
            <div className="p-8 text-center text-sm text-zinc-500">
              Loading your private files...
            </div>
          ) : files.length === 0 ? (
            <div className="p-8 text-center text-sm text-zinc-500">
              Your private folder is empty. Click &quot;+ Upload File&quot; to add files.
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
                  <button
                    onClick={() => handleDownload(file)}
                    className="text-blue-400 hover:underline text-xs"
                  >
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