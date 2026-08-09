import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { nhost } from "../lib/nhost";

export default function Home() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("signin");
  const [error, setError] = useState("");
  const [checkingAuth, setCheckingAuth] = useState(true);

  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const session = await nhost.auth.getSession();

        if (session?.body?.session) {
          router.replace("/dashboard");
          return;
        }
      } catch (err) {
        console.error("Auth check failed:", err);
      } finally {
        setCheckingAuth(false);
      }
    };

    checkAuth();
  }, [router]);

  async function submit(e) {
    e.preventDefault();
    setError("");

    try {
      let response;

      if (mode === "signin") {
        response = await nhost.auth.signInEmailPassword({
          email,
          password,
        });
      } else {
        response = await nhost.auth.signUpEmailPassword({
          email,
          password,
        });
      }

      if (response.body?.error) {
        setError(response.body.error.message || "Authentication failed");
        return;
      }

      if (response.error) {
        setError(response.error.message || "Authentication failed");
        return;
      }

      router.push("/dashboard");
    } catch (err) {
      console.error("Authentication error:", err);
      setError(err.message || "Authentication failed");
    }
  }

  if (checkingAuth) {
    return (
      <div style={{ maxWidth: 380, margin: "80px auto" }}>
        <p>Checking authentication...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 380, margin: "80px auto" }}>
      <h1>AI Agent Workflow Builder</h1>

      <form onSubmit={submit} className="card">
        <div style={{ marginBottom: 10 }}>
          <label>Email</label>
          <br />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            style={{ width: "100%" }}
          />
        </div>

        <div style={{ marginBottom: 10 }}>
          <label>Password</label>
          <br />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            style={{ width: "100%" }}
          />
        </div>

        {error && <p style={{ color: "#ff7a7a" }}>{error}</p>}

        <button className="btn-primary" type="submit">
          {mode === "signin" ? "Sign In" : "Sign Up"}
        </button>

        <p>
          <a
            onClick={() =>
              setMode(mode === "signin" ? "signup" : "signin")
            }
            style={{ cursor: "pointer" }}
          >
            {mode === "signin"
              ? "Need an account? Sign up"
              : "Already have an account? Sign in"}
          </a>
        </p>
      </form>

      <p style={{ opacity: 0.6, fontSize: 13 }}>
        After signup, an org owner must add you via{" "}
        <code>org_members</code> (see README) — org membership is not
        auto-created.
      </p>
    </div>
  );
}
