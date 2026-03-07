import { Link } from "react-router-dom";

function Navbar() {
  return (
    <div className="flex justify-between p-4 bg-gray-800 text-white">

      <Link to="/">Home</Link>
      <Link to="/create">Create Bet</Link>
      <Link to="/leaderboard">Leaderboard</Link>

    </div>
  );
}

export default Navbar;