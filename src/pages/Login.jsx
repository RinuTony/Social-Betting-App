import { useState } from "react";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";

function Login() {

  const navigate = useNavigate();

  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [isSignup,setIsSignup] = useState(false);
  const [loading,setLoading] = useState(false);

  const handleSubmit = async (e) => {

    e.preventDefault();

    setLoading(true);

    try {

      if(isSignup){

        await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password.trim()
        );

        alert("Account created successfully!");

      }else{

        await signInWithEmailAndPassword(
          auth,
          email.trim(),
          password.trim()
        );

      }

      navigate("/");

    } catch(error){

      alert(error.message);

    }

    setLoading(false);

  };

  return (

    <div style={styles.page}>

      <div style={styles.card}>

        <h2 style={{marginBottom:"20px"}}>
          {isSignup ? "Create Account" : "Login"}
        </h2>

        <form onSubmit={handleSubmit} style={styles.form}>

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e)=>setEmail(e.target.value)}
            style={styles.input}
            required
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e)=>setPassword(e.target.value)}
            style={styles.input}
            required
          />

          <button style={styles.button} disabled={loading}>
            {loading ? "Please wait..." : isSignup ? "Sign Up" : "Login"}
          </button>

        </form>

        <p style={{marginTop:"20px"}}>

          {isSignup ? "Already have an account?" : "No account yet?"}

          <button
            style={styles.switch}
            onClick={()=>setIsSignup(!isSignup)}
          >
            {isSignup ? "Login" : "Sign Up"}
          </button>

        </p>

      </div>

    </div>

  );

}

export default Login;

const styles = {

page:{
minHeight:"100vh",
display:"flex",
justifyContent:"center",
alignItems:"center",
background:"#0f172a",
color:"white"
},

card:{
background:"rgba(255,255,255,0.05)",
padding:"40px",
borderRadius:"15px",
width:"340px",
textAlign:"center",
boxShadow:"0 10px 30px rgba(0,0,0,0.4)"
},

form:{
display:"flex",
flexDirection:"column",
gap:"12px"
},

input:{
padding:"12px",
borderRadius:"8px",
border:"none",
outline:"none"
},

button:{
padding:"12px",
borderRadius:"8px",
background:"#6366f1",
color:"white",
border:"none",
cursor:"pointer",
fontWeight:"600"
},

switch:{
marginLeft:"10px",
background:"none",
border:"none",
color:"#6366f1",
cursor:"pointer",
fontWeight:"600"
}

};