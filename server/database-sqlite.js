var path = require('path');
var Promise = require('bluebird');
var db = require('sqlite')
var createUserStmt, submitBidStmt, slotQueryStmt, allSlotsQueryStmt, userQueryStmt, allUsersQueryStmt, recentBiddingsQueryStmt, nukeBiddingsStmt, nukeUsersStmt;

let initialize = () =>
	Promise
		.resolve()
		.then(() => db.open(path.join(__dirname, '..', 'database.db'), { Promise }))
		.then(() => console.log("Opened database"))
		.then(() => db.run(
			`CREATE TABLE IF NOT EXISTS users (
				user_id TEXT NOT NULL PRIMARY KEY,
				first_name TEXT NOT NULL,
				last_name TEXT NOT NULL,
				company TEXT,
				table_number INTEGER NOT NULL
			)`
		))
		.then(() => console.log("Created table Users"))
		.then(() => db.run(
			`CREATE TABLE IF NOT EXISTS biddings (
				bid_id TEXT NOT NULL,
				user_id TEXT NOT NULL,
				slot INTEGER NOT NULL,
				bid INTEGER NOT NULL
			)`
		))
		.then(() => console.log("Created table Biddings"))
		.then(() => {
			db.prepare('INSERT OR IGNORE INTO users VALUES(?, ?, ?, ?, ?)')
			.then(stmt => createUserStmt = stmt);

			db.prepare('INSERT INTO biddings VALUES(?, ?, ?, ?)')
			.then(stmt => submitBidStmt = stmt);

			db.prepare(`
				SELECT t.slot, t.bid, GROUP_CONCAT(DISTINCT t.user_id) AS max_user_ids
				FROM biddings t
				WHERE t.bid =
				    (SELECT MAX(h.bid)
				    FROM biddings h
				    WHERE h.slot = t.slot)
				AND t.slot = ?
				GROUP BY t.slot, t.bid
				`)
			.then(stmt => slotQueryStmt = stmt);

			db.prepare(`
				SELECT t.slot, t.bid, GROUP_CONCAT(DISTINCT t.user_id) AS max_user_ids
				FROM biddings t
				WHERE t.bid =
				    (SELECT MAX(h.bid)
				    FROM biddings h
				    WHERE h.slot = t.slot)
				GROUP BY t.slot, t.bid
				`)
			.then(stmt => allSlotsQueryStmt = stmt);

			db.prepare(`
				SELECT user_id, first_name, last_name, company, table_number
				FROM users
				WHERE user_id = ?
				`)
			.then(stmt => userQueryStmt = stmt);

			db.prepare(`
				SELECT user_id, first_name, last_name, company, table_number
				FROM users
				`)
			.then(stmt => allUsersQueryStmt = stmt);

			db.prepare(`
				SELECT bid_id, slot, user_id, bid
				FROM biddings
				ORDER BY rowid DESC
				LIMIT ?
				`)
			.then(stmt => recentBiddingsQueryStmt = stmt);

			db.prepare(`
				DELETE FROM biddings;
				VACCUM;
				`)
			.then(stmt => nukeBiddingsStmt = stmt);

			db.prepare(`
				DELETE FROM users;
				VACCUM;
				`)
			.then(stmt => nukeUsersStmt = stmt);
		})
		.then(() => console.log("Database initialization completed"))
		.catch(err => console.error(err.stack));

let getUser = userID =>
	Promise.resolve(userQueryStmt.get(userID));
let getAllUsers = () =>
	Promise.resolve(allUsersQueryStmt.all());
let createUser = userInfo =>
	Promise.resolve(
		createUserStmt.run(
			userInfo.userID,
			userInfo.firstName,
			userInfo.lastName,
			userInfo.company,
			userInfo.table));
let nukeUsers = () =>
	Promise.resolve(nukeUsersStmt.run());

let getRecentBiddings = size =>
	Promise.resolve(recentBiddingsQueryStmt.all(size));
let submitBid = bidInfo =>
	Promise.resolve(
		submitBidStmt.run(
			bidInfo.bidID,
			bidInfo.userID,
			bidInfo.slot,
			bidInfo.bid));
let nukeBiddings = () =>
	Promise.resolve(nukeBiddingsStmt.run());

let getSlotInfo = slot =>
	Promise.resolve(slotQueryStmt.get(slot));
let getAllSlotsInfo = () =>
	Promise.resolve(allSlotsQueryStmt.all());

module.exports = {
	initialize: initialize,

	getUser: getUser,
	getAllUsers: getAllUsers,
	createUser: createUser,
	nukeUsers: nukeUsers,

	getRecentBiddings: getRecentBiddings,
	submitBid: submitBid,
	nukeBiddings: nukeBiddings,

	getSlotInfo: getSlotInfo,
	getAllSlotsInfo: getAllSlotsInfo
};