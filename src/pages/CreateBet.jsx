import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";

function CreateBet() {
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [isCreated, setIsCreated] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();

    // 1. Create the bet object
    const newBet = {
      id: Date.now(), // Unique ID for now
      question: title,
      deadline: deadline,
      proofUploaded: false,
      participants: 0,
      yes: 50, // Default starting split
      no: 50,
      creator: "Me"
    };

    // 2. Save to LocalStorage (Temporary "Backend")
    const existingBets = JSON.parse(localStorage.getItem("myBets") || "[]");
    localStorage.setItem("myBets", JSON.stringify([newBet, ...existingBets]));

    // 3. Show success and redirect
    setIsCreated(true);
    setTimeout(() => navigate("/"), 1500); 
  };

  return (
    <div style={styles.pageWrapper}>
      <div style={styles.container}>
        
        <Link to="/" style={styles.backLink}>← Back to Feed</Link>

        <div style={styles.glassCard}>
          {!isCreated ? (
            <>
              <h1 style={styles.title}>Create a Bet</h1>
              <p style={styles.subtitle}>
                Put your reputation on the line. What are you going to achieve?
              </p>

              <form onSubmit={handleSubmit} style={styles.form}>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>I will...</label>
                  <input
                    type="text"
                    placeholder="e.g. Finish the hackathon project by 8 AM"
                    style={styles.input}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </div>

                <div style={styles.inputGroup}>
                  <label style={styles.label}>By when?</label>
                  <input
                    type="datetime-local"
                    style={styles.input}
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    required
                  />
                </div>

                <div style={styles.aiHint}>
                  <span>✨</span> 
                  <small>AI Prediction: <b>45%</b> chance of success. This sounds tough!</small>
                </div>

                <button type="submit" style={styles.submitBtn}>
                  Confirm & Go Live
                </button>
              </form>
            </>
          ) : (
            <div style={styles.successState}>
              <div style={styles.successIcon}>🚀</div>
              <h2>Bet is LIVE!</h2>
              <p>Redirecting you to the feed...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  pageWrapper: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)", // Matches Home.jsx
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Inter', sans-serif",
    color: "white"
  },
  container: { width: "100%", maxWidth: "500px", padding: "20px" },
  backLink: { color: "#94a3b8", textDecoration: "none", fontSize: "14px", marginBottom: "20px", display: "inline-block" },
  glassCard: {
    background: "rgba(255, 255, 255, 0.05)",
    backdropFilter: "blur(15px)",
    padding: "40px",
    borderRadius: "24px",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    boxShadow: "0 20px 40px rgba(0,0,0,0.4)"
  },
  title: { fontSize: "28px", fontWeight: "800", marginBottom: "10px" },
  subtitle: { color: "#94a3b8", marginBottom: "30px", lineHeight: "1.5" },
  form: { display: "flex", flexDirection: "column", gap: "20px" },
  inputGroup: { display: "flex", flexDirection: "column", gap: "8px" },
  label: { fontSize: "14px", fontWeight: "600", color: "#cbd5e1" },
  input: {
    background: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "12px",
    padding: "12px 15px",
    color: "white",
    fontSize: "16px",
    outline: "none"
  },
  aiHint: {
    padding: "12px",
    background: "rgba(99, 102, 241, 0.1)",
    borderRadius: "10px",
    border: "1px dashed rgba(99, 102, 241, 0.4)",
    fontSize: "13px",
    color: "#a5b4fc"
  },
  submitBtn: {
    background: "#6366f1",
    color: "white",
    border: "none",
    padding: "15px",
    borderRadius: "12px",
    fontWeight: "700",
    fontSize: "16px",
    cursor: "pointer",
    boxShadow: "0 4px 15px rgba(99, 102, 241, 0.4)",
    marginTop: "10px"
  },
  successState: { textAlign: "center", padding: "20px" },
  successIcon: { fontSize: "50px", marginBottom: "20px" }
};

export default CreateBet;