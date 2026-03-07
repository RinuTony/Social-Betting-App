import { useState } from "react";

function CreateBet() {

  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();

    console.log(title, deadline);
  };

  return (
    <div className="p-6">

      <h1 className="text-xl font-bold mb-4">Create Bet</h1>

      <form onSubmit={handleSubmit}>

        <input
          type="text"
          placeholder="Bet description"
          className="border p-2 w-full mb-3"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <input
          type="datetime-local"
          className="border p-2 w-full mb-3"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
        />

        <button className="bg-blue-500 text-white px-4 py-2 rounded">
          Create Bet
        </button>

      </form>
    </div>
  );
}

export default CreateBet;