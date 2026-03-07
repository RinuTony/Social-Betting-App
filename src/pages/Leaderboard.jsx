function Leaderboard() {

  const users = [
    { name: "Maya", coins: 5200 },
    { name: "Rahul", coins: 4700 },
    { name: "Alex", coins: 4200 }
  ];

  return (
    <div className="p-6">

      <h1 className="text-2xl font-bold mb-4">Leaderboard</h1>

      {users.map((user, index) => (
        <div key={index} className="flex justify-between border-b py-2">
          <span>{index + 1}. {user.name}</span>
          <span>{user.coins} coins</span>
        </div>
      ))}

    </div>
  );
}

export default Leaderboard;