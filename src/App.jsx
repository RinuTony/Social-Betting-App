import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import CreateBet from "./pages/CreateBet";
import Leaderboard from "./pages/Leaderboard";
import BetPage from "./pages/BetPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/create" element={<CreateBet />} />
      <Route path="/bet/:id" element={<BetPage />} />
      <Route path="/leaderboard" element={<Leaderboard />} />
    </Routes>
  );
}

export default App;