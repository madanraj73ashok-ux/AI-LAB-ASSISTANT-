"use client";

import * as React from "react";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export interface AuthUIProps {
  onLogin?: (credentials: { username: string; password: string; role?: string }) => void;
  onRegister?: (data: { username: string; password: string; fullName?: string }) => void;
}

export function AuthUI({ onLogin, onRegister }: AuthUIProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [role, setRole] = useState<"student" | "staff">("student");
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!username.trim() || !password.trim()) {
      setError("Please fill in all fields.");
      return;
    }

    setLoading(true);

    if (isSignUp) {
      if (password.length < 6) {
        setError("Password must be at least 6 characters.");
        setLoading(false);
        return;
      }
      if (onRegister) {
        onRegister({ username, password, fullName });
      } else {
        try {
          const res = await fetch("/signup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            setError(data.message || "Failed to create account.");
          } else {
            setSuccess("Account created successfully! Switching to login...");
            setTimeout(() => {
              setIsSignUp(false);
              setSuccess("");
            }, 1200);
          }
        } catch {
          setError("Server error during registration.");
        }
      }
      setLoading(false);
    } else {
      if (onLogin) {
        onLogin({ username, password, role });
      } else {
        try {
          const res = await fetch("/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password, role }),
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            // Smart fallback check
            const fallbackRole = role === "student" ? "staff" : "student";
            const fallbackRes = await fetch("/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ username, password, role: fallbackRole }),
            });
            const fallbackData = await fallbackRes.json();
            if (fallbackRes.ok && fallbackData.success) {
              handleSuccess(fallbackData, fallbackRole);
              return;
            }
            setError(data.message || "Invalid credentials.");
            setLoading(false);
            return;
          }
          handleSuccess(data, role);
        } catch {
          setError("Unable to connect to authentication server.");
          setLoading(false);
        }
      }
    }
  };

  const handleSuccess = (data: any, userRole: string) => {
    const uname = data.username || username;
    localStorage.setItem("username", uname);
    localStorage.setItem("role", userRole);
    if (userRole === "staff" || userRole === "admin") {
      sessionStorage.setItem("currentStaffUser", JSON.stringify(data.user || { username: uname, role: "staff" }));
      window.location.href = "staff-dashboard.html";
    } else {
      sessionStorage.setItem("currentUser", JSON.stringify(data.user || { username: uname, role: "student" }));
      window.location.href = "dashboard.html";
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-[#0d0e12] font-['Plus_Jakarta_Sans',sans-serif]">
      <div className="w-full max-w-[1060px] min-h-[640px] bg-[#15161b] rounded-[28px] overflow-hidden shadow-2xl border border-white/5 grid grid-cols-1 md:grid-cols-2">
        {/* Left Form Panel */}
        <div className="p-8 md:p-14 flex flex-col justify-between bg-[#15161b]">
          <div>
            {/* Role Switcher */}
            <div className="inline-flex bg-[#1c1d24] border border-[#272832] p-1 rounded-xl mb-7 gap-1">
              <button
                type="button"
                onClick={() => { setRole("student"); setError(""); }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  role === "student"
                    ? "bg-[#8b5cf6] text-white shadow-md shadow-purple-500/30"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                🎓 Student
              </button>
              <button
                type="button"
                onClick={() => { setRole("staff"); setError(""); if (isSignUp) setIsSignUp(false); }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  role === "staff"
                    ? "bg-[#8b5cf6] text-white shadow-md shadow-purple-500/30"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                🛡️ Staff & HOD
              </button>
            </div>

            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight font-['Outfit',sans-serif]">
              {isSignUp ? "Sign Up" : "Login"}
            </h1>
            <p className="text-sm text-zinc-400 mt-1 mb-8">
              {isSignUp
                ? "Enter your details to create an account"
                : role === "staff"
                ? "Enter your staff / HOD account details"
                : "Enter your account details"}
            </p>

            {error && (
              <div className="mb-5 p-3 rounded-xl bg-red-950/30 border border-red-800/50 text-red-300 text-xs text-center">
                {error}
              </div>
            )}
            {success && (
              <div className="mb-5 p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/50 text-emerald-300 text-xs text-center">
                {success}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {isSignUp && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-400">Full Name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full bg-transparent border-b border-[#2b2c37] focus:border-[#8b5cf6] py-2 text-sm text-white placeholder-zinc-600 outline-none transition-colors"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-400">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  required
                  className="w-full bg-transparent border-b border-[#2b2c37] focus:border-[#8b5cf6] py-2 text-sm text-white placeholder-zinc-600 outline-none transition-colors"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-400">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full bg-transparent border-b border-[#2b2c37] focus:border-[#8b5cf6] py-2 pr-8 text-sm text-white placeholder-zinc-600 outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-0 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {!isSignUp && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => alert("Please contact your lab coordinator to reset credentials.")}
                    className="text-xs text-zinc-400 hover:text-[#a78bfa] transition-colors"
                  >
                    Forgot Password?
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white font-semibold text-sm rounded-xl shadow-lg shadow-purple-500/30 transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50"
              >
                {loading ? "Processing..." : isSignUp ? "Sign Up" : "Login"}
              </button>
            </form>
          </div>

          <div className="mt-8 flex items-center text-xs text-zinc-400">
            <span>{isSignUp ? "Already have an account?" : "Don't have an account?"}</span>
            <button
              type="button"
              onClick={() => { setIsSignUp(!isSignUp); setError(""); setSuccess(""); }}
              className="ml-3 px-3 py-1.5 bg-[#202127] hover:bg-[#2a2b34] text-zinc-200 border border-[#2e303b] rounded-lg transition-colors"
            >
              {isSignUp ? "Login" : "Sign up"}
            </button>
          </div>
        </div>

        {/* Right Purple Illustration Panel */}
        <div className="relative p-8 md:p-12 flex flex-col justify-between bg-gradient-to-br from-[#7c3aed] via-[#8b5cf6] to-[#6d28d9] overflow-hidden">
          {/* Ambient organic blobs */}
          <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full bg-purple-900/40 blur-xl pointer-events-none" />

          <div className="relative z-10">
            <h2 className="text-3xl md:text-5xl font-extrabold text-white leading-tight font-['Outfit',sans-serif]">
              Welcome to<br />
              <span>{role === "staff" ? "staff portal" : "student portal"}</span>
            </h2>
            <p className="text-purple-100 text-sm md:text-base mt-2 font-medium">
              {role === "staff" ? "Login to access department controls" : "Login to access your account"}
            </p>
          </div>

          <div className="relative z-10 flex justify-center items-end mt-auto pt-6">
            <img
              src="images/student_portal_illustration.jpg"
              alt="Student Portal Illustration"
              className="max-h-[380px] w-auto object-contain rounded-2xl drop-shadow-2xl"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default AuthUI;
