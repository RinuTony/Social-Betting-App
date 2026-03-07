import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import logo from "../assets/logo.jpeg";

function Home() {

  const [coins] = useState(100);
  const [darkMode, setDarkMode] = useState(true);

  const myBets = [
    { id: 1, question: "Complete gym workout today", proofUploaded: false },
    { id: 2, question: "Wake up before 6 AM tomorrow", proofUploaded: true }
  ];

  const communityBets = [
    { id: 3, question: "Alex will run 5km today", yes: 60, no: 40 },
    { id: 4, question: "Sam will finish the project tonight", yes: 35, no: 65 }
  ];

  useEffect(() => {
    document.body.style.opacity = 0;

    setTimeout(() => {
      document.body.classList.toggle("light-mode", !darkMode);
      document.body.style.opacity = 1;
    }, 200);

  }, [darkMode]);

  const uploadProof = (id) => {
    alert("Proof uploaded for bet " + id);
  };

  const vote = (id, choice) => {
    alert(`Vote recorded: ${choice}`);
  };

  return (
    <div style={styles.container}>

      {/* HEADER */}

      <div style={styles.header}>

        <div style={styles.titleContainer}>
          <img src={logo} alt="Bet On Me Logo" style={styles.logo}/>
          <h1 style={styles.title}>Bet On Me</h1>
        </div>

        <div style={styles.headerRight}>

          <span style={styles.coins}>{coins} Coins</span>

          <button
            style={styles.toggle}
            onClick={() => setDarkMode(!darkMode)}
          >
            {darkMode ? "Light Mode" : "Dark Mode"}
          </button>

        </div>

      </div>

      {/* NAVIGATION */}

      <div style={styles.nav}>

        <Link to="/create">
          <button style={styles.primaryBtn}>
            Create Bet
          </button>
        </Link>

        <Link to="/leaderboard">
          <button style={styles.secondaryBtn}>
            Leaderboard
          </button>
        </Link>

      </div>

      {/* MY BETS */}

      <h2 style={styles.section}>My Bets</h2>

      <div style={styles.grid}>

        {myBets.map((bet) => (

          <div key={bet.id} style={styles.card}>

            <h3>{bet.question}</h3>

            <div style={styles.actions}>

              {!bet.proofUploaded ? (
                <button
                  style={styles.primaryBtn}
                  onClick={() => uploadProof(bet.id)}
                >
                  Upload Proof
                </button>
              ) : (
                <span style={styles.completed}>
                  Proof Submitted
                </span>
              )}

              <Link to={`/bet/${bet.id}`}>
                <button style={styles.secondaryBtn}>
                  View
                </button>
              </Link>

            </div>

          </div>

        ))}

      </div>

      {/* COMMUNITY BETS */}

      <h2 style={styles.section}>Community Bets</h2>

      <div style={styles.grid}>

        {communityBets.map((bet) => (

          <div key={bet.id} style={styles.card}>

            <h3>{bet.question}</h3>

            {/* Vote Percentage Bars */}

            <div style={styles.progressContainer}>

              <div style={styles.progressBar}>

                <div
                  style={{
                    ...styles.yesBar,
                    width: `${bet.yes}%`
                  }}
                />

                <div
                  style={{
                    ...styles.noBar,
                    width: `${bet.no}%`
                  }}
                />

              </div>

              <div style={styles.percentLabels}>
                <span>{bet.yes}% Yes</span>
                <span>{bet.no}% No</span>
              </div>

            </div>

            <div style={styles.voteRow}>

              <div style={styles.voteButtons}>

                <button
                  style={styles.yesBtn}
                  onClick={() => vote(bet.id, "YES")}
                >
                  Yes
                </button>

                <button
                  style={styles.noBtn}
                  onClick={() => vote(bet.id, "NO")}
                >
                  No
                </button>

              </div>

              <Link to={`/bet/${bet.id}`}>
                <button style={styles.secondaryBtn}>
                  Details
                </button>
              </Link>

            </div>

          </div>

        ))}

      </div>

    </div>
  );
}

export default Home;

const styles = {

container:{
maxWidth:"1100px",
margin:"auto",
padding:"40px",
transition:"color 0.3s ease"
},

header:{
display:"flex",
justifyContent:"space-between",
alignItems:"center",
paddingBottom:"10px"
},

titleContainer:{
display:"flex",
alignItems:"center",
gap:"10px"
},

logo:{
width:"36px",
height:"36px",
objectFit:"contain"
},

title:{
margin:0,
fontSize:"28px",
fontWeight:"800",
letterSpacing:"0.5px"
},

headerRight:{
display:"flex",
gap:"15px",
alignItems:"center"
},

coins:{
color:"var(--secondary-text)",
fontWeight:"600"
},

toggle:{
padding:"8px 14px",
border:"none",
borderRadius:"6px",
background:"var(--button-secondary)",
color:"white",
cursor:"pointer"
},

nav:{
marginTop:"25px",
display:"flex",
gap:"15px"
},

primaryBtn:{
padding:"10px 18px",
border:"none",
borderRadius:"6px",
background:"var(--button-primary)",
color:"white",
cursor:"pointer"
},

secondaryBtn:{
padding:"10px 18px",
border:"none",
borderRadius:"6px",
background:"var(--button-secondary)",
color:"white",
cursor:"pointer"
},

section:{
marginTop:"40px"
},

grid:{
display:"grid",
gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",
gap:"20px",
marginTop:"15px"
},

card:{
background:"linear-gradient(145deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
backdropFilter:"blur(8px)",
padding:"20px",
borderRadius:"12px",
boxShadow:"0 8px 30px rgba(0,0,0,0.35)",
transition:"transform 0.2s ease"
},

actions:{
display:"flex",
justifyContent:"space-between",
alignItems:"center",
marginTop:"12px"
},

voteRow:{
display:"flex",
justifyContent:"space-between",
alignItems:"center",
marginTop:"14px"
},

voteButtons:{
display:"flex",
gap:"10px"
},

completed:{
color:"var(--yes)",
fontWeight:"600"
},

yesBtn:{
padding:"8px 14px",
background:"var(--yes)",
border:"none",
borderRadius:"6px",
color:"white",
cursor:"pointer"
},

noBtn:{
padding:"8px 14px",
background:"var(--no)",
border:"none",
borderRadius:"6px",
color:"white",
cursor:"pointer"
},

progressContainer:{
marginTop:"12px"
},

progressBar:{
height:"10px",
display:"flex",
borderRadius:"6px",
overflow:"hidden",
background:"rgba(255,255,255,0.1)"
},

yesBar:{
background:"var(--yes)"
},

noBar:{
background:"var(--no)"
},

percentLabels:{
display:"flex",
justifyContent:"space-between",
fontSize:"12px",
marginTop:"4px",
color:"var(--secondary-text)"
}

};