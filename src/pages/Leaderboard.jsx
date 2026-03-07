import { Link } from "react-router-dom";

function Leaderboard() {
  // Enhanced mock data with ranks and trends
  const users = [
    { name: "Maya", coins: 5200, trend: "up", avatar: "M" },
    { name: "Rahul", coins: 4700, trend: "down", avatar: "R" },
    { name: "Alex", coins: 4200, trend: "stable", avatar: "A" },
    { name: "You", coins: 1000, trend: "up", avatar: "U" },
    { name: "Sarah", coins: 850, trend: "stable", avatar: "S" },
  ];

  return (
    <div style={styles.pageWrapper}>
      <div style={styles.container}>
        
        <header style={styles.header}>
          <Link to="/" style={styles.backLink}>← Back to Home</Link>
          <h1 style={styles.title}>Top Predictors</h1>
          <p style={styles.subtitle}>The most accurate friends in your circle</p>
        </header>

        {/* TOP 3 PODIUM SECTION */}
        <div style={styles.podiumContainer}>
          {users.slice(0, 3).map((user, index) => (
            <div key={index} style={index === 0 ? styles.firstPlace : styles.otherPlace}>
              <div style={styles.podiumAvatar}>
                {user.avatar}
                {index === 0 && <span style={styles.crown}>👑</span>}
              </div>
              <div style={styles.podiumName}>{user.name}</div>
              <div style={styles.podiumCoins}>{user.coins}</div>
              <div style={styles.rankBadge}>{index + 1}st</div>
            </div>
          ))}
        </div>

        {/* LIST SECTION */}
        <div style={styles.listContainer}>
          {users.map((user, index) => (
            <div key={index} style={styles.userRow}>
              <div style={styles.userLeft}>
                <span style={styles.index}>{index + 1}</span>
                <div style={styles.miniAvatar}>{user.avatar}</div>
                <span style={user.name === "You" ? styles.highlightName : {}}>{user.name}</span>
              </div>
              
              <div style={styles.userRight}>
                <span style={styles.coinText}>{user.coins.toLocaleString()}</span>
                <span style={styles.trendIcon}>
                  {user.trend === "up" ? "📈" : user.trend === "down" ? "📉" : "↔️"}
                </span>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

const styles = {
  pageWrapper: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)",
    color: "white",
    fontFamily: "'Inter', sans-serif",
    padding: "40px 20px"
  },
  container: { maxWidth: "600px", margin: "auto" },
  header: { textAlign: "center", marginBottom: "40px" },
  backLink: { color: "#94a3b8", textDecoration: "none", fontSize: "14px", display: "block", marginBottom: "10px" },
  title: { fontSize: "32px", fontWeight: "800", margin: "0 0 5px 0" },
  subtitle: { color: "#94a3b8", fontSize: "14px" },
  
  podiumContainer: {
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-end",
    gap: "15px",
    marginBottom: "40px",
    paddingTop: "20px"
  },
  firstPlace: {
    background: "rgba(255, 215, 0, 0.1)",
    border: "1px solid rgba(255, 215, 0, 0.3)",
    borderRadius: "20px 20px 0 0",
    padding: "20px",
    textAlign: "center",
    width: "120px",
    order: 2, // Center
    backdropFilter: "blur(10px)"
  },
  otherPlace: {
    background: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "20px 20px 0 0",
    padding: "15px",
    textAlign: "center",
    width: "100px",
    order: 1, // Default left/right
    backdropFilter: "blur(10px)"
  },
  podiumAvatar: {
    width: "50px", height: "50px", background: "#6366f1", borderRadius: "50%", 
    margin: "0 auto 10px", display: "flex", alignItems: "center", 
    justifyContent: "center", fontWeight: "bold", position: "relative"
  },
  crown: { position: "absolute", top: "-20px", fontSize: "24px" },
  podiumName: { fontWeight: "bold", fontSize: "14px" },
  podiumCoins: { fontSize: "12px", color: "#fbbf24", fontWeight: "bold" },
  rankBadge: { 
    marginTop: "10px", display: "inline-block", padding: "4px 8px", 
    background: "rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: "10px" 
  },

  listContainer: {
    background: "rgba(255, 255, 255, 0.03)",
    borderRadius: "24px",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    overflow: "hidden"
  },
  userRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "15px 25px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
    transition: "background 0.2s",
  },
  userLeft: { display: "flex", alignItems: "center", gap: "15px" },
  index: { color: "#64748b", fontWeight: "bold", width: "20px" },
  miniAvatar: {
    width: "32px", height: "32px", background: "rgba(255,255,255,0.1)", 
    borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px"
  },
  highlightName: { color: "#6366f1", fontWeight: "bold" },
  userRight: { display: "flex", alignItems: "center", gap: "10px" },
  coinText: { fontWeight: "bold", color: "white" },
  trendIcon: { fontSize: "14px" }
};

export default Leaderboard;