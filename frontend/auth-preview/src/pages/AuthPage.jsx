import { useState } from "react";
import { Link2, ShieldCheck, Users, CalendarDays, Eye, EyeOff } from "lucide-react";
import "../styles/auth.css";

const API_BASE_URL = "http://localhost:5000/api";

export default function AuthPage() {
  const [mode, setMode] = useState("signin");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [loading, setLoading] = useState(false);

  const [signin, setSignin] = useState({
    userId: "",
    password: "",
  });

  const [signup, setSignup] = useState({
    userId: "",
    password: "",
    confirmPassword: "",
    email: "",
    mobile: "",
  });

  const changeMode = (nextMode) => {
    setMode(nextMode);
    setMessage({ type: "", text: "" });
  };

  const handleSignIn = async (e) => {
    e.preventDefault();

    if (!signin.userId.trim() || !signin.password) {
      setMessage({ type: "error", text: "Please enter your User ID and password." });
      return;
    }

    /*
      Replace this demo section with your real API call.

      Example:

      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signin),
      });

      const data = await response.json();

      // data.user.role determines the dashboard.
      // Do NOT ask the user to select a role.
    */

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setMessage({
        type: "success",
        text: `Login successful for ${signin.userId}. Connect this form to your backend to redirect by role.`,
      });
    }, 600);
  };

  const handleSignUp = async (e) => {
    e.preventDefault();

    if (
      !signup.userId.trim() ||
      !signup.password ||
      !signup.confirmPassword ||
      !signup.email.trim() ||
      !signup.mobile.trim()
    ) {
      setMessage({ type: "error", text: "Please fill in all fields." });
      return;
    }

    if (signup.password !== signup.confirmPassword) {
      setMessage({ type: "error", text: "Passwords do not match." });
      return;
    }

    if (signup.password.length < 6) {
      setMessage({ type: "error", text: "Password must contain at least 6 characters." });
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(signup.email)) {
      setMessage({ type: "error", text: "Please enter a valid email address." });
      return;
    }

    if (!/^[0-9]{10}$/.test(signup.mobile)) {
      setMessage({ type: "error", text: "Mobile number must contain 10 digits." });
      return;
    }

    /*
      Replace this demo section with:

      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: signup.userId,
          password: signup.password,
          email: signup.email,
          mobile: signup.mobile,
        }),
      });

      IMPORTANT:
      Do not send a role from this form.
      The Admin creates/assigns roles from the admin panel.
    */

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setMessage({
        type: "success",
        text: "Account details are valid. Connect this form to your backend registration API.",
      });
    }, 600);
  };

  return (
    <main className="auth-page">
      <section className="auth-shell">
        <aside className="auth-brand">
          <div className="brand-top">
            <div className="brand-mark">
              <Link2 size={25} strokeWidth={2.4} />
            </div>
            <div>
              <span className="eyebrow">STUDENT ORGANIZATION</span>
              <h1>Club<span>Hub</span></h1>
            </div>
          </div>

          <div className="brand-copy">
            <div className="mini-badge">
              <ShieldCheck size={15} />
              Secure organization access
            </div>

            <h2>Everything your club needs, <em>in one place.</em></h2>

            <p>
              Manage members, events, tickets, merchandise, volunteers,
              announcements and finances from one unified platform.
            </p>
          </div>

          <div className="feature-list">
            <div className="feature-item">
              <span><Users size={18} /></span>
              <div>
                <strong>One member database</strong>
                <small>Keep every member and membership record organized.</small>
              </div>
            </div>

            <div className="feature-item">
              <span><CalendarDays size={18} /></span>
              <div>
                <strong>Events without the chaos</strong>
                <small>Tickets, QR check-in and attendance in one flow.</small>
              </div>
            </div>

            <div className="feature-item">
              <span><ShieldCheck size={18} /></span>
              <div>
                <strong>Role-based access</strong>
                <small>Your registered User ID determines your access level.</small>
              </div>
            </div>
          </div>

          <div className="brand-footer">
            <span>Built for student organizations</span>
            <span className="dot" />
            <span>2026</span>
          </div>
        </aside>

        <section className="auth-card-area">
          <div className="auth-card">
            <div className="mobile-logo">
              <div className="brand-mark">
                <Link2 size={21} />
              </div>
              <strong>Club<span>Hub</span></strong>
            </div>

            <div className="auth-heading">
              <span className="section-label">
                {mode === "signin" ? "WELCOME BACK" : "JOIN THE CLUB"}
              </span>
              <h2>{mode === "signin" ? "Sign in to your account" : "Create your account"}</h2>
              <p>
                {mode === "signin"
                  ? "Enter your registered credentials to continue."
                  : "Create your account. Your role will be assigned by an administrator."}
              </p>
            </div>

            <div className="auth-tabs">
              <button
                type="button"
                className={mode === "signin" ? "active" : ""}
                onClick={() => changeMode("signin")}
              >
                Sign In
              </button>
              <button
                type="button"
                className={mode === "signup" ? "active" : ""}
                onClick={() => changeMode("signup")}
              >
                Sign Up
              </button>
            </div>

            {message.text && (
              <div className={`form-message ${message.type}`}>
                {message.text}
              </div>
            )}

            {mode === "signin" ? (
              <form className="auth-form" onSubmit={handleSignIn}>
                <Field
                  label="User ID"
                  placeholder="Enter your User ID"
                  value={signin.userId}
                  onChange={(e) => setSignin({ ...signin, userId: e.target.value })}
                />

                <PasswordField
                  label="Password"
                  placeholder="Enter your password"
                  value={signin.password}
                  visible={showPassword}
                  onToggle={() => setShowPassword(!showPassword)}
                  onChange={(e) => setSignin({ ...signin, password: e.target.value })}
                />

                <div className="form-row">
                  <label className="remember">
                    <input type="checkbox" />
                    <span>Remember me</span>
                  </label>
                  <button type="button" className="text-button">Forgot password?</button>
                </div>

                <button className="primary-button" type="submit" disabled={loading}>
                  {loading ? "Signing in..." : "Sign In"}
                  {!loading && <span>→</span>}
                </button>
              </form>
            ) : (
              <form className="auth-form" onSubmit={handleSignUp}>
                <Field
                  label="User ID"
                  placeholder="Choose a User ID"
                  value={signup.userId}
                  onChange={(e) => setSignup({ ...signup, userId: e.target.value })}
                />

                <div className="two-columns">
                  <PasswordField
                    label="Password"
                    placeholder="Create password"
                    value={signup.password}
                    visible={showPassword}
                    onToggle={() => setShowPassword(!showPassword)}
                    onChange={(e) => setSignup({ ...signup, password: e.target.value })}
                  />

                  <PasswordField
                    label="Confirm Password"
                    placeholder="Repeat password"
                    value={signup.confirmPassword}
                    visible={showConfirm}
                    onToggle={() => setShowConfirm(!showConfirm)}
                    onChange={(e) => setSignup({ ...signup, confirmPassword: e.target.value })}
                  />
                </div>

                <Field
                  label="Email ID"
                  type="email"
                  placeholder="you@example.com"
                  value={signup.email}
                  onChange={(e) => setSignup({ ...signup, email: e.target.value })}
                />

                <Field
                  label="Mobile Number"
                  type="tel"
                  placeholder="10-digit mobile number"
                  value={signup.mobile}
                  onChange={(e) =>
                    setSignup({
                      ...signup,
                      mobile: e.target.value.replace(/\D/g, "").slice(0, 10),
                    })
                  }
                />

                <div className="role-note">
                  <ShieldCheck size={17} />
                  <span>
                    <strong>No role selection required.</strong> Your access level
                    will be assigned by the organization administrator.
                  </span>
                </div>

                <button className="primary-button" type="submit" disabled={loading}>
                  {loading ? "Creating account..." : "Create Account"}
                  {!loading && <span>→</span>}
                </button>
              </form>
            )}

            <p className="auth-switch">
              {mode === "signin" ? "Don't have an account?" : "Already have an account?"}
              <button
                type="button"
                onClick={() => changeMode(mode === "signin" ? "signup" : "signin")}
              >
                {mode === "signin" ? "Create one" : "Sign in"}
              </button>
            </p>

            <div className="security-note">
              <ShieldCheck size={14} />
              <span>Your credentials are protected by secure authentication.</span>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

function Field({ label, type = "text", placeholder, value, onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        autoComplete="off"
      />
    </label>
  );
}

function PasswordField({ label, placeholder, value, visible, onToggle, onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="password-wrap">
        <input
          type={visible ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          autoComplete="new-password"
        />
        <button type="button" onClick={onToggle} aria-label="Toggle password visibility">
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </label>
  );
}
