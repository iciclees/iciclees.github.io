/* Phase definitions */
const PHASES = [
	{ number: 1, description: "2 sets of 3" },
	{ number: 2, description: "1 set of 3 + 1 run of 4" },
	{ number: 3, description: "1 set of 4 + 1 run of 4" },
	{ number: 4, description: "1 run of 7" },
	{ number: 5, description: "1 run of 8" },
	{ number: 6, description: "1 run of 9" },
	{ number: 7, description: "2 sets of 4" },
	{ number: 8, description: "7 cards of 1 color" },
	{ number: 9, description: "1 set of 5 + 1 set of 2" },
	{ number: 10, description: "1 set of 5 + 1 set of 3" }
];

/* Game state management */
const STORAGE_KEY = "phase-o-matic-state";

const GameState = {
	data: {
		players: [],
		round: 0,
		history: [],
		status: "setup"
	},

	load() {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) return;

			const parsed = JSON.parse(raw);
			if (parsed && Array.isArray(parsed.players)) {
				this.data = parsed;
			}
		} catch (error) {
			console.warn("Failed to load game state:", error);
		}
	},

	save() {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
		} catch (error) {
			console.warn("Failed to save game state:", error);
		}
	},

	reset() {
		this.data = {
			players: [],
			round: 0,
			history: [],
			status: "setup"
		};
		this.save();
	},

	addPlayer(name) {
		const trimmed = (name || "").trim();
		if (!trimmed || this.data.players.length >= 6) return false;

		const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
		this.data.players.push({
			id,
			name: trimmed,
			phase: 1,
			totalPoints: 0
		});
		this.save();
		return true;
	},

	startGame() {
		if (this.data.players.length < 2 || this.data.players.length > 6) return false;

		for (const player of this.data.players) {
			player.phase = 1;
			player.totalPoints = 0;
		}

		this.data.round = 1;
		this.data.status = "active";
		this.data.history = [];
		this.save();
		return true;
	},

	_applyRound(roundEntry) {
		for (const entry of roundEntry.entries) {
			const player = this.data.players.find((candidate) => candidate.id === entry.playerId);
			if (!player) continue;

			// Re-derive phaseBefore on every replay so edits to earlier rounds propagate.
			entry.phaseBefore = player.phase;
			player.totalPoints += entry.points;
			if (entry.phaseCompleted && player.phase < 10) {
				player.phase += 1;
			}
		}
	},

	recomputeFromHistory() {
		for (const player of this.data.players) {
			player.phase = 1;
			player.totalPoints = 0;
		}

		for (const roundEntry of this.data.history) {
			this._applyRound(roundEntry);
		}

		const winners = this.computeWinners();
		if (winners.length > 0) {
			this.data.status = "finished";
		} else {
			const lastRound = this.data.history[this.data.history.length - 1];
			this.data.round = lastRound ? lastRound.round + 1 : 1;
			this.data.status = "active";
		}
		this.save();
	},

	saveHistoryEntry(roundEntry, index = null) {
		if (index === null) {
			this.data.history.push(roundEntry);
		} else {
			this.data.history[index] = roundEntry;
		}
		this.recomputeFromHistory();
	},

	getLastCompletedPhase(playerId) {
		for (let roundIndex = this.data.history.length - 1; roundIndex >= 0; roundIndex--) {
			const entry = this.data.history[roundIndex].entries.find((candidate) => candidate.playerId === playerId);
			if (!entry) continue;

			return entry.phaseCompleted ? entry.phaseBefore : Math.max(0, entry.phaseBefore - 1);
		}

		return 0;
	},

	computeWinners() {
		if (this.data.history.length === 0) return [];

		const lastRound = this.data.history[this.data.history.length - 1];
		const completedPhase10Ids = lastRound.entries
			.filter((entry) => entry.phaseBefore === 10 && entry.phaseCompleted)
			.map((entry) => entry.playerId);

		if (completedPhase10Ids.length === 0) return [];

		const completedPlayers = this.data.players
			.filter((player) => completedPhase10Ids.includes(player.id))
			.sort((a, b) => a.totalPoints - b.totalPoints);
		const lowestScore = completedPlayers[0].totalPoints;

		return completedPlayers.filter((player) => player.totalPoints === lowestScore);
	}
};

/* UI rendering helpers */
const UI = {
	setupScreen: document.getElementById("setupScreen"),
	gameScreen: document.getElementById("gameScreen"),
	gameOverScreen: document.getElementById("gameOverScreen"),
	historyCard: document.getElementById("historyCard"),
	historyBody: document.getElementById("historyBody"),
	playerList: document.getElementById("playerList"),
	scoreboardBody: document.getElementById("scoreboardBody"),
	playerCountLabel: document.getElementById("playerCountLabel"),
	roundLabel: document.getElementById("roundLabel"),
	stateLabel: document.getElementById("stateLabel"),
	setupError: document.getElementById("setupError"),
	winnerTitle: document.getElementById("winnerTitle"),
	winnerSubtitle: document.getElementById("winnerSubtitle"),
	winnerList: document.getElementById("winnerList"),
	finalRankingList: document.getElementById("finalRankingList"),

	renderAll() {
		const state = GameState.data;

		this.playerCountLabel.textContent = state.players.length.toString();
		this.roundLabel.textContent = state.round.toString();
		this.stateLabel.textContent = state.status === "setup"
			? "Setup"
			: state.status === "active"
				? "In Progress"
				: "Finished";

		this.setupScreen.classList.toggle("active", state.status === "setup");
		this.gameScreen.classList.toggle("active", state.status === "active");
		this.gameOverScreen.classList.toggle("active", state.status === "finished");
		this.historyCard.style.display = state.history.length > 0 ? "block" : "none";

		this.renderPlayerList();

		if (state.status !== "setup") {
			this.renderScoreboard();
		} else {
			this.scoreboardBody.innerHTML = "";
		}

		this.renderHistory();

		if (state.status === "finished") {
			this.renderGameOver();
		} else {
			this.winnerTitle.textContent = "";
			this.winnerSubtitle.textContent = "";
			this.winnerList.innerHTML = "";
			this.finalRankingList.innerHTML = "";
		}
	},

	renderPlayerList() {
		const state = GameState.data;
		this.playerList.innerHTML = "";

		if (state.players.length === 0) {
			this.playerList.innerHTML = "<span class='text-muted'>No players added yet.</span>";
			return;
		}

		for (const player of state.players) {
			const chip = document.createElement("div");
			chip.className = "player-chip";
			chip.innerHTML = `<span>${player.name}</span><span class="badge">Phase ${player.phase}</span>`;
			this.playerList.appendChild(chip);
		}
	},

	renderScoreboard() {
		const state = GameState.data;
		this.scoreboardBody.innerHTML = "";

		const sortedPlayers = [...state.players].sort((a, b) => b.phase - a.phase || a.totalPoints - b.totalPoints);
		sortedPlayers.forEach((player, index) => {
			const tr = document.createElement("tr");
			const phaseInfo = PHASES.find((phase) => phase.number === player.phase) || {
				number: player.phase,
				description: "Completed all phases"
			};

			tr.innerHTML = `
				<td class="rank">${index + 1}</td>
				<td class="player-name">${player.name}</td>
				<td><div class="phase-pill"><span class="phase-pill-main">Phase ${phaseInfo.number}</span></div></td>
				<td><span class="phase-pill-desc">${phaseInfo.description}</span></td>
				<td>${player.totalPoints}</td>
			`;
			this.scoreboardBody.appendChild(tr);
		});
	},

	renderHistory() {
		const state = GameState.data;
		this.historyBody.innerHTML = "";

		if (state.history.length === 0) {
			this.historyBody.innerHTML = "<span class='text-muted'>No rounds recorded yet.</span>";
			return;
		}

		state.history.forEach((round, index) => {
			const roundDiv = document.createElement("div");
			roundDiv.className = "round-entry";

			const header = document.createElement("div");
			header.className = "round-header";
			header.innerHTML = `<h3>Round ${round.round}</h3><span class="badge">Players: ${round.entries.length}</span>`;

			const actions = document.createElement("div");
			actions.className = "round-actions";

			const editButton = document.createElement("button");
			editButton.className = "secondary";
			editButton.textContent = "Edit Round";
			editButton.addEventListener("click", () => RoundModal.openForEdit(index));
			actions.appendChild(editButton);
			header.appendChild(actions);
			roundDiv.appendChild(header);

			for (const entry of round.entries) {
				const player = state.players.find((candidate) => candidate.id === entry.playerId);
				if (!player) continue;

				const row = document.createElement("div");
				row.className = "round-player-row";
				const phaseText = `Phase ${entry.phaseBefore}`;
				const completedText = entry.phaseCompleted ? "Completed" : "Not completed";
				row.innerHTML = `<span class="name">${player.name}</span><span class="phase">${phaseText} - ${completedText}</span><span class="points">+${entry.points} pts</span>`;
				roundDiv.appendChild(row);
			}

			this.historyBody.appendChild(roundDiv);
		});
	},

	renderGameOver() {
		const winners = GameState.computeWinners();

		if (winners.length === 0) {
			this.winnerTitle.textContent = "Game Over";
			this.winnerSubtitle.textContent = "No valid winner found (check rules or history).";
			this.winnerList.innerHTML = "";
			this.renderFinalRanking();
			return;
		}

		if (winners.length === 1) {
			this.winnerTitle.textContent = `${winners[0].name} wins!`;
			this.winnerSubtitle.textContent = `Completed Phase 10 with ${winners[0].totalPoints} total points.`;
		} else {
			this.winnerTitle.textContent = "Multiple winners!";
			this.winnerSubtitle.textContent = "Tied for lowest score among players who completed Phase 10.";
		}

		this.winnerList.innerHTML = "";
		for (const winner of winners) {
			const lastCompletedPhase = GameState.getLastCompletedPhase(winner.id);
			const row = document.createElement("div");
			row.className = "winner-row";
			row.innerHTML = `<span class="name">${winner.name}</span><span class="score">${winner.totalPoints} pts</span><span class="phase">${lastCompletedPhase > 0 ? `Phase ${lastCompletedPhase}` : "No phase completed"}</span>`;
			this.winnerList.appendChild(row);
		}

		this.renderFinalRanking();
	},

	renderFinalRanking() {
		const state = GameState.data;
		this.finalRankingList.innerHTML = "";

		const rankedPlayers = [...state.players].sort((a, b) => {
			const phaseDifference = GameState.getLastCompletedPhase(b.id) - GameState.getLastCompletedPhase(a.id);
			return phaseDifference || a.totalPoints - b.totalPoints;
		});
		rankedPlayers.forEach((player, index) => {
			const lastCompletedPhase = GameState.getLastCompletedPhase(player.id);
			const row = document.createElement("div");
			row.className = "winner-row";
			row.innerHTML = `<span class="rank">${index + 1}</span><span class="name">${player.name}</span><span class="score">${player.totalPoints} pts</span><span class="phase">${lastCompletedPhase > 0 ? `Phase ${lastCompletedPhase}` : "No phase completed"}</span>`;
			this.finalRankingList.appendChild(row);
		});
	}
};

/* Round modal and form logic */
const RoundModal = {
	backdrop: document.getElementById("roundModalBackdrop"),
	roundLabel: document.getElementById("modalRoundLabel"),
	formBody: document.getElementById("roundFormBody"),
	errorText: document.getElementById("roundFormError"),
	editingIndex: null,

	open() {
		const state = GameState.data;
		if (state.status !== "active") return;

		this.editingIndex = null;
		this._buildFormForRound(state.round);
		this.backdrop.classList.add("active");
	},

	openForEdit(historyIndex) {
		const state = GameState.data;
		const roundEntry = state.history[historyIndex];
		if (!roundEntry) return;

		this.editingIndex = historyIndex;
		this._buildFormForRound(roundEntry.round, roundEntry);
		this.backdrop.classList.add("active");
	},

	close() {
		this.backdrop.classList.remove("active");
		this.errorText.style.display = "none";
		this.errorText.textContent = "";
	},

	_buildFormForRound(roundNumber, existingEntry = null) {
		const state = GameState.data;
		this.roundLabel.textContent = roundNumber.toString();
		this.formBody.innerHTML = "";
		this.errorText.style.display = "none";
		this.errorText.textContent = "";

		for (const player of state.players) {
			const phaseInfo = PHASES.find((phase) => phase.number === player.phase) || {
				number: player.phase,
				description: "Completed all phases"
			};
			const row = document.createElement("div");
			row.className = "player-round-row";

			const nameDiv = document.createElement("div");
			nameDiv.innerHTML = `<div><strong>${player.name}</strong></div><div class="text-muted">Phase ${phaseInfo.number}: ${phaseInfo.description}</div>`;

			const toggleDiv = document.createElement("div");
			const toggleId = `phaseCompleted-${player.id}`;
			toggleDiv.innerHTML = `<label class="toggle" for="${toggleId}"><input type="checkbox" id="${toggleId}"><span>Phase completed?</span></label>`;

			const pointsDiv = document.createElement("div");
			const pointsId = `points-${player.id}`;
			pointsDiv.innerHTML = `<label for="${pointsId}">Points</label><input type="number" id="${pointsId}" min="0" step="1" placeholder="0">`;

			row.appendChild(nameDiv);
			row.appendChild(toggleDiv);
			row.appendChild(pointsDiv);
			this.formBody.appendChild(row);
		}

		if (existingEntry) {
			for (const entry of existingEntry.entries) {
				const toggleElement = document.getElementById(`phaseCompleted-${entry.playerId}`);
				const pointsElement = document.getElementById(`points-${entry.playerId}`);
				if (toggleElement) toggleElement.checked = !!entry.phaseCompleted;
				if (pointsElement) pointsElement.value = entry.points.toString();
			}
		}
	},

	collectAndValidate() {
		const state = GameState.data;
		const roundEntries = [];
		this.errorText.style.display = "none";
		this.errorText.textContent = "";

		for (const player of state.players) {
			const toggleElement = document.getElementById(`phaseCompleted-${player.id}`);
			const pointsElement = document.getElementById(`points-${player.id}`);
			if (!toggleElement || !pointsElement) continue;

			const phaseCompleted = !!toggleElement.checked;
			const rawPoints = (pointsElement.value || "").trim();
			const points = rawPoints === "" ? 0 : Number(rawPoints);

			if (Number.isNaN(points) || points < 0) {
				this.errorText.textContent = "Points must be zero or a positive integer for all players.";
				this.errorText.style.display = "block";
				return null;
			}

			roundEntries.push({
				playerId: player.id,
				phaseCompleted,
				points
			});
		}

		return roundEntries;
	}
};

/* Event wiring */
function wireEvents() {
	const addPlayerButton = document.getElementById("addPlayerBtn");
	const startGameButton = document.getElementById("startGameBtn");
	const playerNameInput = document.getElementById("playerNameInput");
	const newGameButton = document.getElementById("newGameBtn");
	const endRoundButton = document.getElementById("endRoundBtn");
	const toggleHistoryButton = document.getElementById("toggleHistoryBtn");
	const historyBody = document.getElementById("historyBody");
	const cancelRoundButton = document.getElementById("cancelRoundBtn");
	const confirmRoundButton = document.getElementById("confirmRoundBtn");
	const playAgainButton = document.getElementById("playAgainBtn");

	addPlayerButton.addEventListener("click", () => {
		const ok = GameState.addPlayer(playerNameInput.value);
		if (!ok) {
			UI.setupError.textContent = "Enter a valid name and ensure you have between 2 and 6 players.";
			UI.setupError.style.display = "block";
		} else {
			UI.setupError.style.display = "none";
			playerNameInput.value = "";
		}
		UI.renderAll();
	});

	startGameButton.addEventListener("click", () => {
		const ok = GameState.startGame();
		if (!ok) {
			UI.setupError.textContent = "You must have between 2 and 6 players to start.";
			UI.setupError.style.display = "block";
		} else {
			UI.setupError.style.display = "none";
		}
		UI.renderAll();
	});

	newGameButton.addEventListener("click", () => {
		if (!confirm("Reset the current game and start a new one?")) return;
		GameState.reset();
		UI.renderAll();
	});

	endRoundButton.addEventListener("click", () => {
		if (GameState.data.status !== "active") return;
		RoundModal.open();
	});

	toggleHistoryButton.addEventListener("click", () => {
		historyBody.classList.toggle("active");
	});

	cancelRoundButton.addEventListener("click", () => {
		RoundModal.close();
	});

	confirmRoundButton.addEventListener("click", () => {
		const roundEntries = RoundModal.collectAndValidate();
		if (!roundEntries) return;

		const roundNumber = RoundModal.editingIndex === null
			? GameState.data.round
			: GameState.data.history[RoundModal.editingIndex].round;
		const historyEntry = {
			round: roundNumber,
			entries: []
		};

		if (RoundModal.editingIndex === null) {
			for (const entry of roundEntries) {
				const player = GameState.data.players.find((candidate) => candidate.id === entry.playerId);
				historyEntry.entries.push({
					playerId: entry.playerId,
					phaseBefore: player ? player.phase : 1,
					phaseCompleted: entry.phaseCompleted,
					points: entry.points
				});
			}
			GameState.saveHistoryEntry(historyEntry, null);
		} else {
			const existing = GameState.data.history[RoundModal.editingIndex];
			for (const entry of roundEntries) {
				const existingEntry = existing.entries.find((candidate) => candidate.playerId === entry.playerId);
				const player = GameState.data.players.find((candidate) => candidate.id === entry.playerId);
				const phaseBefore = existingEntry ? existingEntry.phaseBefore : (player?.phase || 1);
				historyEntry.entries.push({
					playerId: entry.playerId,
					phaseBefore,
					phaseCompleted: entry.phaseCompleted,
					points: entry.points
				});
			}
			GameState.saveHistoryEntry(historyEntry, RoundModal.editingIndex);
		}

		RoundModal.close();
		UI.renderAll();
	});

	playAgainButton.addEventListener("click", () => {
		GameState.reset();
		UI.renderAll();
	});
}

/* Initialization */
(function init() {
	GameState.load();
	wireEvents();
	UI.renderAll();

	if ("serviceWorker" in navigator) {
		navigator.serviceWorker.register("./sw.js").catch((error) => {
			console.warn("Failed to register service worker:", error);
		});
	}
})();
