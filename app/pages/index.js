import { useState } from "react";
import { useRouter } from "next/router";
import { useAuthenticationStatus } from "@nhost/nextjs";
import { nhost } from "../lib/nhost";

export default function Home() {
  const { isAuthenticated, isLoading } = useAuthenticationStatus();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("signin");
  const [error, setError] = useState("");
  const router = useRouter();

  if (!isLoading && isAuthenticated) {
    router.push("/dashboard");
    return null;
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    const fn = mode === "signin" ? nhost.auth.signIn : nhost.auth.signUp;
    const { error } = await fn({ email, password });
    if (error) setError(error.message);
    else router.push("/dashboard");
  }

  return (
    <div style={{ maxWidth: 380, margin: "80px auto" }}>
      <h1>AI Agent Workflow Builder</h1>
      <form onSubmit={submit} className="card">
        <div style={{ marginBottom: 10 }}>
          <label>Email</label><br />
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required style={{ width: "100%" }} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label>Password</label><br />
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required style={{ width: "100%" }} />
        </div>
        {error && <p style={{ color: "#ff7a7a" }}>{error}</p>}
        <button className="btn-primary" type="submit">{mode === "signin" ? "Sign In" : "Sign Up"}</button>
        <p>
          <a onClick={() => setMode(mode === "signin" ? "signup" : "signin")} style={{ cursor: "pointer" }}>
            {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
          </a>
        </p>
      </form>
      <p style={{ opacity: 0.6, fontSize: 13 }}>
        After signup, an org owner must add you via <code>org_members</code> (see README) — org membership is not auto-created.
      </p>
    </div>
  );
}
