import { Link } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import logo from "../assets/logo.jpeg";

function Home() {
  const [coins, setCoins] = useState(100);
  const [darkMode, setDarkMode] = useState(true);
  const [myBets, setMyBets] = useState([]);
  const [verifyingId, setVerifyingId] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);

  // Mock Global Data (Static for now as requested)
  const [communityBets, setCommunityBets] = useState([
    { id: 101, question: "Alex will run 5km today", yes: 60, no: 40, yesVotes: 75, noVotes: 50, creator: "Alex", category: "Health", verifiedCount: 12 },
    { id: 102, question: "Sam will finish the project tonight", yes: 35, no: 65, yesVotes: 35, noVotes: 65, creator: "Sam", category: "Productivity", verifiedCount: 5 },
    { id: 103, question: "I will not text my ex tonight", yes: 5, no: 95, yesVotes: 22, noVotes: 418, creator: "Sarah", category: "Funny", verifiedCount: 88 }
  ]);

  useEffect(() => {
    // 1. Load Personal Bets from LocalStorage
    const savedBets = JSON.parse(localStorage.getItem("myBets") || "[]");
    
    // If LocalStorage is totally empty, we show one default starter bet
    if (savedBets.length === 0 && !localStorage.getItem("hasVisitedBefore")) {
      const defaultMocks = [
        { id: Date.now(), question: "Complete gym workout today", category: "Health", status: "OPEN" },
      ];
      setMyBets(defaultMocks);
      localStorage.setItem("myBets", JSON.stringify(defaultMocks));
      localStorage.setItem("hasVisitedBefore", "true");
    } else {
      setMyBets(savedBets);
    }

    // 2. Handle Dark Mode Styles
    const root = document.documentElement;
    if (darkMode) {
      root.style.setProperty('--bg-gradient', 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)');
      root.style.setProperty('--card-bg', 'rgba(255, 255, 255, 0.07)');
      root.style.setProperty('--text-main', '#ffffff');
      root.style.setProperty('--text-dim', '#94a3b8');
    } else {
      root.style.setProperty('--bg-gradient', 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)');
      root.style.setProperty('--card-bg', 'rgba(255, 255, 255, 0.9)');
      root.style.setProperty('--text-main', '#1e293b');
      root.style.setProperty('--text-dim', '#64748b');
    }
  }, [darkMode]);

  // --- DELETE FEATURE (Synced with LocalStorage) ---
  const deleteBet = (id) => {
    if (window.confirm("Are you sure you want to remove this bet?")) {
      const updatedBets = myBets.filter(bet => bet.id !== id);
      setMyBets(updatedBets);
      localStorage.setItem("myBets", JSON.stringify(updatedBets));
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0].name);
    }
  };

  // --- AI VERIFICATION (Synced with LocalStorage) ---
  const handleAISubmission = (id) => {
    if (!selectedFile) return alert("Please select a file first!");
    
    // Simulate AI analysis delay
    setTimeout(() => {
      const updated = myBets.map(bet => 
        bet.id === id ? { ...bet, status: "VERIFIED" } : bet
      );
      setMyBets(updated);
      localStorage.setItem("myBets", JSON.stringify(updated));
      setCoins(prev => prev + 50);
      setVerifyingId(null);
      setSelectedFile(null);
      alert("AI Verified! +50 Coins added.");
    }, 1500);
  };

  // --- SOCIAL FEED LOGIC (State Only) ---
  const handleSocialVote = (id, type) => {
    setCommunityBets(prev => prev.map(bet => {
      if (bet.id === id) {
        const updatedYesVotes = type === 'yes' ? bet.yesVotes + 1 : bet.yesVotes;
        const updatedNoVotes = type === 'no' ? bet.noVotes + 1 : bet.noVotes;
        const total = updatedYesVotes + updatedNoVotes;
        return {
          ...bet,
          yesVotes: updatedYesVotes,
          noVotes: updatedNoVotes,
          yes: Math.round((updatedYesVotes / total) * 100),
          no: Math.round((updatedNoVotes / total) * 100)
        };
      }
      return bet;
    }));
  };

  const handleVerifyHappened = (id, creator) => {
    setCommunityBets(prev => prev.map(bet => 
      bet.id === id ? { ...bet, verifiedCount: bet.verifiedCount + 1 } : bet
    ));
    alert(`Verification logged! @${creator} gets closer to their reward.`);
  };

  const getCatStyle = (cat) => {
    switch(cat) {
      case 'Productivity': return { color: '#a78bfa', bg: 'rgba(167, 139, 250, 0.15)' };
      case 'Health': return { color: '#34d399', bg: 'rgba(52, 211, 153, 0.15)' };
      case 'Funny': return { color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.15)' };
      default: return { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' };
    }
  };

  return (
    <div style={styles.pageWrapper}>
      <div style={styles.container}>
        <header style={styles.header}>
          <div style={styles.titleContainer}>
            <img src={logo} alt="Logo" style={styles.logo}/>
            <h1 style={styles.title}>Bet On Me</h1>
          </div>
          <div style={styles.headerRight}>
            <div style={styles.coinBadge}>💰 {coins} <span style={{fontSize: '10px', marginLeft: '4px'}}>COINS</span></div>
            <button style={styles.toggle} onClick={() => setDarkMode(!darkMode)}>{darkMode ? "☀️" : "🌙"}</button>
          </div>
        </header>

        <div style={styles.heroSection}>
          <h2 style={{fontSize: '32px', marginBottom: '10px'}}>Will you do it?</h2>
          <div style={styles.nav}>
            <Link to="/create"><button style={styles.primaryBtn}>+ Create New Bet</button></Link>
            <Link to="/leaderboard"><button style={styles.glassBtn}>🏆 Leaderboard</button></Link>
          </div>
        </div>

        {/* SECTION: MY STAKES */}
        <section>
          <h3 style={styles.sectionTitle}>My Active Stakes</h3>
          <div style={styles.grid}>
            {myBets.length === 0 && (
              <p style={{color: 'var(--text-dim)', fontStyle: 'italic'}}>No active bets. Start by creating one!</p>
            )}
            {myBets.map((bet) => (
              <div key={bet.id} style={styles.glassCard}>
                <div style={styles.cardHeader}>
                  <span style={{...styles.tag, color: getCatStyle(bet.category).color, background: getCatStyle(bet.category).bg}}>
                    {bet.category?.toUpperCase() || "PERSONAL"}
                  </span>
                  <button onClick={() => deleteBet(bet.id)} style={styles.deleteBtn} title="Delete Bet">🗑️</button>
                </div>
                <h4 style={styles.betQuestion}>{bet.question}</h4>
                <div style={styles.actions}>
                  {bet.status === "VERIFIED" ? (
                    <div style={styles.successStatus}>✅ Verified by AI • +50 Coins</div>
                  ) : verifyingId === bet.id ? (
                    <div style={styles.uploadArea}>
                      <input type="file" accept="image/*" ref={fileInputRef} style={{display: 'none'}} onChange={handleFileChange} />
                      <button style={styles.fileBtn} onClick={() => fileInputRef.current.click()}>
                        {selectedFile ? `📸 ${selectedFile}` : "📷 Upload Proof"}
                      </button>
                      <button style={styles.submitBtn} onClick={() => handleAISubmission(bet.id)}>Submit Proof</button>
                      <button style={{...styles.voteBtnSmall, marginTop: '4px'}} onClick={() => setVerifyingId(null)}>Cancel</button>
                    </div>
                  ) : (
                    <button style={styles.actionBtn} onClick={() => setVerifyingId(bet.id)}>Verify Success</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION: GLOBAL FEED */}
        <section style={{marginTop: '50px', paddingBottom: '40px'}}>
          <h3 style={styles.sectionTitle}>Global Social Feed</h3>
          <div style={styles.grid}>
            {communityBets.map((bet) => (
              <div key={bet.id} style={styles.glassCard}>
                <div style={styles.cardHeader}>
                  <span style={{...styles.tag, color: getCatStyle(bet.category).color, background: getCatStyle(bet.category).bg}}>{bet.category}</span>
                  <span style={{fontSize: '12px', color: 'var(--text-dim)'}}>{bet.yesVotes + bet.noVotes} predictions</span>
                </div>
                <div style={{marginBottom: '10px'}}><small style={{color: '#6366f1', fontWeight: 'bold'}}>@{bet.creator.toLowerCase()}</small></div>
                <h4 style={styles.betQuestion}>{bet.question}</h4>
                <div style={styles.progressWrapper}>
                  <div style={styles.progressBarContainer}>
                    <div style={{...styles.progressFill, width: `${bet.yes}%`, background: '#6366f1'}} />
                  </div>
                  <div style={styles.percentLabels}>
                    <span>{bet.yes}% Believe</span>
                    <span>{bet.no}% Doubt</span>
                  </div>
                </div>
                <div style={styles.voteRow}>
                  <button style={styles.voteBtnSmall} onClick={() => handleSocialVote(bet.id, 'yes')}>I Believe</button>
                  <button style={styles.voteBtnSmall} onClick={() => handleSocialVote(bet.id, 'no')}>Doubt it</button>
                </div>
                <div style={styles.divider} />
                <button style={styles.verifyHappenedBtn} onClick={() => handleVerifyHappened(bet.id, bet.creator)}>
                  Confirm: This Happened ({bet.verifiedCount})
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

const styles = {
  pageWrapper: { minHeight: "100vh", background: "var(--bg-gradient)", color: "var(--text-main)", transition: "all 0.4s ease", fontFamily: "'Inter', sans-serif" },
  container: { maxWidth: "1100px", margin: "auto", padding: "20px 40px" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 0" },
  titleContainer: { display: "flex", alignItems: "center", gap: "12px" },
  logo: { width: "40px", height: "40px", borderRadius: "10px" },
  title: { fontSize: "24px", fontWeight: "800", margin: 0 },
  headerRight: { display: "flex", gap: "15px", alignItems: "center" },
  coinBadge: { background: "rgba(255, 215, 0, 0.15)", padding: "8px 15px", borderRadius: "20px", border: "1px solid rgba(255, 215, 0, 0.3)", fontWeight: "bold", color: "#fbbf24" },
  toggle: { background: "var(--card-bg)", border: "1px solid rgba(255,255,255,0.1)", color: "inherit", padding: "8px 12px", borderRadius: "10px", cursor: "pointer" },
  heroSection: { padding: "40px 0", textAlign: "left" },
  nav: { display: "flex", gap: "15px" },
  primaryBtn: { background: "#6366f1", color: "white", border: "none", padding: "12px 24px", borderRadius: "12px", fontWeight: "600", cursor: "pointer" },
  glassBtn: { background: "var(--card-bg)", color: "var(--text-main)", border: "1px solid rgba(255,255,255,0.1)", padding: "12px 24px", borderRadius: "12px", cursor: "pointer" },
  sectionTitle: { fontSize: "20px", fontWeight: "700", marginBottom: "20px", opacity: 0.9 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "25px" },
  glassCard: { background: "var(--card-bg)", backdropFilter: "blur(12px)", borderRadius: "20px", padding: "24px", border: "1px solid rgba(255,255,255,0.1)", position: 'relative' },
  cardHeader: { display: "flex", justifyContent: "space-between", marginBottom: "15px", alignItems: 'center' },
  tag: { fontSize: "10px", fontWeight: "800", padding: "4px 8px", borderRadius: "6px" },
  deleteBtn: { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '16px', opacity: 0.6, transition: '0.2s', padding: '5px' },
  betQuestion: { fontSize: "18px", fontWeight: "600", margin: "0 0 15px 0", lineHeight: "1.4" },
  uploadArea: { display: 'flex', flexDirection: 'column', gap: '8px' },
  fileBtn: { background: 'rgba(255,255,255,0.1)', color: 'inherit', border: '1px dashed rgba(255,255,255,0.3)', padding: '12px', borderRadius: '10px', cursor: 'pointer' },
  submitBtn: { background: '#22c55e', color: 'white', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' },
  actionBtn: { width: "100%", background: "white", color: "black", border: "none", padding: "12px", borderRadius: "10px", fontWeight: "700", cursor: "pointer" },
  successStatus: { color: "#22c55e", fontWeight: "bold", textAlign: 'center', background: 'rgba(34, 197, 94, 0.1)', padding: '10px', borderRadius: '10px' },
  progressWrapper: { marginBottom: "15px" },
  progressBarContainer: { height: "6px", background: "rgba(0,0,0,0.1)", borderRadius: "3px", overflow: "hidden" },
  progressFill: { height: "100%", transition: "width 0.4s ease-out" },
  percentLabels: { display: "flex", justifyContent: "space-between", fontSize: "11px", marginTop: "8px", fontWeight: "600" },
  voteRow: { display: "flex", gap: "10px" },
  voteBtnSmall: { flex: 1, background: "rgba(255,255,255,0.05)", color: "var(--text-main)", border: "1px solid rgba(255,255,255,0.1)", padding: "8px", borderRadius: "8px", cursor: "pointer", fontSize: "12px" },
  divider: { margin: '20px 0', height: '1px', background: 'rgba(255,255,255,0.1)' },
  verifyHappenedBtn: { width: "100%", background: "rgba(34, 197, 94, 0.15)", color: "#4ade80", border: "1px solid #22c55e", padding: "12px", borderRadius: "10px", fontWeight: "700", cursor: "pointer" }
};

export default Home;