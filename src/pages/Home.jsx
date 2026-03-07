import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import logo from "../assets/logo.jpeg";

function Home() {
  const [coins] = useState(100);
  const [darkMode, setDarkMode] = useState(true);
  const [myBets, setMyBets] = useState([]);

  // Mock community data
  const communityBets = [
    { id: 101, question: "Alex will run 5km today", yes: 60, no: 40, creator: "Alex" },
    { id: 102, question: "Sam will finish the project tonight", yes: 35, no: 65, creator: "Sam" }
  ];

  useEffect(() => {
    // 1. Fetch bets from LocalStorage + add some default mocks if empty
    const savedBets = JSON.parse(localStorage.getItem("myBets") || "[]");
    
    // If no bets exist yet, we can show one hardcoded example
    const defaultMocks = [
      { id: 1, question: "Complete gym workout today", proofUploaded: false, participants: 12, isMock: true },
    ];

    setMyBets(savedBets.length > 0 ? savedBets : defaultMocks);

    // 2. Apply theme-specific CSS variables
    const root = document.documentElement;
    if (darkMode) {
      root.style.setProperty('--bg-gradient', 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)');
      root.style.setProperty('--card-bg', 'rgba(255, 255, 255, 0.07)');
      root.style.setProperty('--text-main', '#ffffff');
      root.style.setProperty('--text-dim', '#94a3b8');
    } else {
      root.style.setProperty('--bg-gradient', 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)');
      root.style.setProperty('--card-bg', 'rgba(0, 0, 0, 0.03)');
      root.style.setProperty('--text-main', '#1e293b');
      root.style.setProperty('--text-dim', '#64748b');
    }
  }, [darkMode]);

  const deleteBet = (id) => {
    const updated = myBets.filter(bet => bet.id !== id);
    setMyBets(updated);
    localStorage.setItem("myBets", JSON.stringify(updated));
  };

  return (
    <div style={styles.pageWrapper}>
      <div style={styles.container}>
        
        {/* HEADER */}
        <header style={styles.header}>
          <div style={styles.titleContainer}>
            <img src={logo} alt="Logo" style={styles.logo}/>
            <h1 style={styles.title}>Bet On Me</h1>
          </div>

          <div style={styles.headerRight}>
            <div style={styles.coinBadge}>
              <span style={{marginRight: '5px'}}>💰</span>
              {coins} <span style={{fontSize: '10px', marginLeft: '4px'}}>COINS</span>
            </div>
            <button style={styles.toggle} onClick={() => setDarkMode(!darkMode)}>
              {darkMode ? "☀️ Light" : "🌙 Dark"}
            </button>
          </div>
        </header>

        {/* HERO / NAV SECTION */}
        <div style={styles.heroSection}>
          <h2 style={{fontSize: '32px', marginBottom: '10px'}}>Will you do it?</h2>
          <p style={{color: 'var(--text-dim)', marginBottom: '20px'}}>Put your reputation on the line.</p>
          <div style={styles.nav}>
            <Link to="/create"><button style={styles.primaryBtn}>+ Create New Bet</button></Link>
            <Link to="/leaderboard"><button style={styles.glassBtn}>🏆 Leaderboard</button></Link>
          </div>
        </div>

        {/* SECTIONS */}
        <div style={styles.mainContent}>
          <section>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <h3 style={styles.sectionTitle}>My Active Stakes</h3>
                {myBets.length > 0 && <small style={{color: 'var(--text-dim)'}}>{myBets.length} Active</small>}
            </div>
            
            <div style={styles.grid}>
              {myBets.length > 0 ? myBets.map((bet) => (
                <div key={bet.id} style={styles.glassCard}>
                  <div style={styles.cardHeader}>
                    <span style={styles.tag}>PERSONAL</span>
                    <button 
                        onClick={() => deleteBet(bet.id)}
                        style={{background: 'none', border: 'none', color: '#ff4d4d', cursor: 'pointer', fontSize: '12px'}}
                    >
                        Delete
                    </button>
                  </div>
                  <h4 style={styles.betQuestion}>{bet.question}</h4>
                  <div style={styles.actions}>
                    {!bet.proofUploaded ? (
                      <button style={styles.actionBtn} onClick={() => alert("Upload Proof Mock")}>Verify Success</button>
                    ) : (
                      <span style={styles.statusBadge}>✅ Pending Review</span>
                    )}
                  </div>
                </div>
              )) : (
                <p style={{color: 'var(--text-dim)', fontStyle: 'italic'}}>No active bets. Start a challenge!</p>
              )}
            </div>
          </section>

          <section style={{marginTop: '50px'}}>
            <h3 style={styles.sectionTitle}>Friends' Activities</h3>
            <div style={styles.grid}>
              {communityBets.map((bet) => (
                <div key={bet.id} style={styles.glassCard}>
                  <div style={styles.cardHeader}>
                    <span style={{...styles.tag, background: '#8b5cf6'}}>{bet.creator}</span>
                  </div>
                  <h4 style={styles.betQuestion}>{bet.question}</h4>
                  
                  <div style={styles.progressWrapper}>
                    <div style={styles.progressBarContainer}>
                      <div style={{...styles.progressFill, width: `${bet.yes}%`, background: '#22c55e'}} />
                    </div>
                    <div style={styles.percentLabels}>
                      <span>{bet.yes}% Yes</span>
                      <span>{bet.no}% No</span>
                    </div>
                  </div>

                  <div style={styles.voteRow}>
                    <button style={styles.voteBtnYes} onClick={() => alert("Betting Yes!")}>Predict Yes</button>
                    <button style={styles.voteBtnNo} onClick={() => alert("Betting No!")}>No Way</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

const styles = {
  pageWrapper: {
    minHeight: "100vh",
    background: "var(--bg-gradient)",
    color: "var(--text-main)",
    transition: "all 0.4s ease",
    fontFamily: "'Inter', sans-serif"
  },
  container: {
    maxWidth: "1100px",
    margin: "auto",
    padding: "20px 40px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "20px 0",
  },
  titleContainer: { display: "flex", alignItems: "center", gap: "12px" },
  logo: { width: "40px", height: "40px", borderRadius: "10px", objectFit: 'cover' },
  title: { fontSize: "24px", fontWeight: "800", margin: 0 },
  headerRight: { display: "flex", gap: "15px", alignItems: "center" },
  coinBadge: {
    background: "rgba(255, 215, 0, 0.15)",
    padding: "8px 15px",
    borderRadius: "20px",
    border: "1px solid rgba(255, 215, 0, 0.3)",
    fontWeight: "bold",
    color: "#fbbf24"
  },
  toggle: {
    background: "var(--card-bg)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "inherit",
    padding: "8px 12px",
    borderRadius: "10px",
    cursor: "pointer"
  },
  heroSection: { padding: "60px 0", textAlign: "left" },
  nav: { display: "flex", gap: "15px" },
  primaryBtn: {
    background: "#6366f1",
    color: "white",
    border: "none",
    padding: "12px 24px",
    borderRadius: "12px",
    fontWeight: "600",
    cursor: "pointer",
    boxShadow: "0 4px 15px rgba(99, 102, 241, 0.4)"
  },
  glassBtn: {
    background: "var(--card-bg)",
    backdropFilter: "blur(10px)",
    color: "var(--text-main)",
    border: "1px solid rgba(255,255,255,0.1)",
    padding: "12px 24px",
    borderRadius: "12px",
    cursor: "pointer"
  },
  sectionTitle: { fontSize: "20px", fontWeight: "700", marginBottom: "20px", opacity: 0.9 },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
    gap: "25px"
  },
  glassCard: {
    background: "var(--card-bg)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    borderRadius: "20px",
    padding: "24px",
    border: "1px solid rgba(255,255,255,0.1)",
    boxShadow: "0 10px 30px rgba(0,0,0,0.1)",
    transition: "transform 0.3s ease",
  },
  cardHeader: { display: "flex", justifyContent: "space-between", marginBottom: "15px", alignItems: 'center' },
  tag: { fontSize: "10px", fontWeight: "800", background: "#3b82f6", padding: "4px 8px", borderRadius: "6px", color: "white" },
  betQuestion: { fontSize: "18px", fontWeight: "600", margin: "0 0 20px 0", lineHeight: "1.4" },
  progressWrapper: { marginBottom: "20px" },
  progressBarContainer: { height: "8px", background: "rgba(0,0,0,0.1)", borderRadius: "4px", overflow: "hidden" },
  progressFill: { height: "100%", transition: "width 0.5s ease" },
  percentLabels: { display: "flex", justifyContent: "space-between", fontSize: "12px", marginTop: "8px", fontWeight: "500" },
  voteRow: { display: "flex", gap: "10px" },
  voteBtnYes: { flex: 1, background: "rgba(34, 197, 94, 0.2)", color: "#4ade80", border: "1px solid #22c55e", padding: "10px", borderRadius: "10px", cursor: "pointer", fontWeight: "600" },
  voteBtnNo: { flex: 1, background: "rgba(239, 68, 68, 0.2)", color: "#f87171", border: "1px solid #ef4444", padding: "10px", borderRadius: "10px", cursor: "pointer", fontWeight: "600" },
  actionBtn: { width: "100%", background: "white", color: "black", border: "none", padding: "12px", borderRadius: "10px", fontWeight: "700", cursor: "pointer" },
  statusBadge: { color: "#22c55e", fontWeight: "bold", fontSize: "14px" }
};

export default Home;