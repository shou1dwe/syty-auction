var Promise = require('bluebird');
var utils = require('./utils.js');
var database = require('./database.js');

let allowBiddings = true;

exports.setApp = (app, io) => {
    io.on('connection', socket => {
        Promise
            .join(
                buildSlotInfoSnapshot(),
                buildEventSnapshot(process.env.EVENT_SNAPSHOT_SIZE || app.locals.eventSnapshotSize),
                (slotInfoSnapshot, eventSnapshot) => ({ slots: slotInfoSnapshot, events: eventSnapshot }))
            .then(snapshotJson => JSON.stringify(snapshotJson))
            .then(snapshotData => socket.emit('data', snapshotData));
    });

    app.post('/submit', (request, response) => {
        if (!allowBiddings) {
            response.status(403).send('Bidding is not allowed at the moment');
            return;
        }

        utils
            .checkAuth(request.cookies.sytyAuth)
            .then(authValidationResult => validateUserPermission(authValidationResult))
            .then(authValidationResult => validateBid(authValidationResult, request))
            .then(bidValidationResult => executeBid(bidValidationResult))
            .then(submissionResult => respondBiddingResult(submissionResult, response))
            .then(submissionResult => executeUpdate(submissionResult, io));
    });

    app.post('/adminSubmit', (request, response) => {
        Promise
            .resolve(utils.validateUserInfo(request.body))
            .then(userInfoValidationResult => utils.createUserIfRequired(userInfoValidationResult))
            .then(authValidationResult => validateBid(authValidationResult, request))
            .then(bidValidationResult => executeBid(bidValidationResult))
            .then(submissionResult => respondBiddingResult(submissionResult, response))
            .then(submissionResult => executeUpdate(submissionResult, io));
    });

    app.get('/areyousure/toggleBiddingPermission', (request, response) => {
        allowBiddings = !allowBiddings;
        response.status(200).send('Toggled bidding permission to ' + allowBiddings);
    });

    app.post('/areyousure/toggleUser', (request, response) => {
        database
            .toggleUserPermission(request.body.userID)
            .then(() => response.status(200).send('Toggled bidding permission for User'))
            .catch(err => {
                console.error('Failed to toggle User permission', err);
                response.status(400).send('Failed to toggle User permission');
            });
    });

    app.get('/areyousure/nukeUsers', (request, response) => {
        database
            .nukeUsers()
            .then(() => response.status(200).send('Cleaned up all Users'))
            .catch(err => {
                console.error('Failed to nuke Users', err.stack);
                response.status(400).send('Failed to clean up Users');
            });
    });

    app.post('/areyousure/deleteBid', (request, response) => {
        database
            .deleteBid(request.body.bidID, request.body.slot)
            .then(() => response.status(200).send('Single bid deleted successfully'))
            .catch(err => {
                console.error('Failed to delete single bid', err);
                response.status(400).send('Failed to delete single bid');
            })
            .finally(() => {
                buildSlotInfoUpdate(request.body.slot)
                    .then(slotInfoUpdate => ({ slots: [slotInfoUpdate], events: [], isLiveUpdate: true }))
                    .then(updateJson => JSON.stringify(updateJson))
                    .then(update => io.sockets.emit('data', update));
            });
    });

    app.get('/areyousure/nukeBiddings', (request, response) => {
        database
            .nukeBiddings()
            .then(() => response.status(200).send('Cleaned up all Biddings history'))
            .catch(err => {
                console.error('Failed to nuke Biddings history', err.stack);
                response.status(400).send('Failed to clean up Biddings history');
            });
    });

    app.get('/reporting/users', (request, response) => {
        database
            .getAllUsers()
            .then(users => response.status(200).send(JSON.stringify(users)))
            .catch(err => {
                console.error('Failed to query Users', err.stack);
                response.status(400).send('Failed to query Users');
            });
    });

    app.get('/reporting/biddings', (request, response) => {
        buildSlotInfoSnapshot()
            .then(slotInfoSnapshot => response.status(200).send(JSON.stringify(slotInfoSnapshot)))
            .catch(err => {
                console.error('Failed to query Biddings result', err.stack);
                response.status(400).send('Failed to query Biddings result');
            });
    });

    let bot;
    app.get('/startBot', function (request, response) {
        if(bot) clearInterval(bot);
        bot = setInterval(function() {
            io.sockets.emit('data', getRandomUpdates());
        }, request.query.sec);
        response.send();
    });

    app.get('/stopBot', function (request, response) {
        if(bot) clearInterval(bot);
        response.send();
    });
};

let buildSlotInfoSnapshot = () =>
    database
        .getAllSlotsInfo()
        .map(slotInfo => parseSlotInfo(slotInfo));

let buildEventSnapshot = (size) =>
    database
        .getRecentBiddings(size)
        .map(event => buildEventUpdate(event.bid_id, event.user_id, event.slot, event.bid));

let validateUserPermission = (authValidationResult) => {
    if (!authValidationResult.isValid)
        return authValidationResult;

    return database
                .getUser(authValidationResult.userID)
                .then(user => {
                    if (user.permission != 1) {
                        authValidationResult.isValid = false;
                        authValidationResult.error = 'Not allowed to bid';
                    }
                    return authValidationResult;
                });
};

let validateBid = (authValidationResult, request) => {
    let requestContent = {
        userID: (authValidationResult.userID) || "",
        slot: (request.body && request.body.slot) || "",
        bid: (request.body && request.body.bid) || "",
    };

    let error;
    if (!authValidationResult.isValid) {
        console.error('Invalid Auth validation result', authValidationResult);
        error = authValidationResult.error || 'Unauthorized';    
    }
    else if (!requestContent.slot || isNaN(requestContent.slot))
        error = 'Slot number is invalid';
    else if (!requestContent.bid || isNaN(requestContent.bid))
        error = 'Bid amount is invalid';

    requestContent.error = error;
    requestContent.isValid = typeof error === 'undefined';
    return requestContent;
};

let executeBid = (validationResult) => {
    if (!validationResult.isValid)
        return validationResult;

    validationResult.bidID = utils.uuid();
    return database
                .submitBid(validationResult)
                .then(() => validationResult)
                .catch(err => {
                    validationResult.error = 'Failed to submit';
                    validationResult.isValid = false;
                    console.error(validationResult.error, err.stack);
                    return validationResult;
                });
};

let respondBiddingResult = (submissionResult, response) => {
    if (submissionResult.isValid)
        response.status(200).send('Submit successful');
    else
        response.status(400).send(submissionResult.error);
    return submissionResult;
};

let executeUpdate = (submissionResult, io) => {
    if (!submissionResult.isValid)
        return;

    console.log('Sending live update after Bidding', submissionResult);
    buildUpdate(submissionResult.bidID, submissionResult.userID, submissionResult.slot, submissionResult.bid)
        .then(updateJson => JSON.stringify(updateJson))
        .then(update => io.sockets.emit('data', update));
};

let buildUpdate = (bidID, userID, slot, bid) =>
    Promise
        .join(
            buildSlotInfoUpdate(slot),
            buildEventUpdate(bidID, userID, slot, bid),
            (slotInfoUpdate, eventUpdate) => ({ slots: [slotInfoUpdate], events: [eventUpdate], isLiveUpdate: true })
        );

let buildSlotInfoUpdate = slot =>
    database
        .getSlotInfo(slot)
        .then(slotInfo => parseSlotInfo(slotInfo));

let parseSlotInfo = slotInfo => {
    let index = parseInt(slotInfo.slot) - 1;
    if (slotInfo.bid > 0) {
        return Promise
                    .resolve(slotInfo.max_user_ids.split(','))
                    .map(userID => getUserInfo(userID))
                    .then(userInfo => ({
                        index: index,
                        highestBid: slotInfo.bid,
                        highestBidders: userInfo
                    }));
    }
    return { index: index };
};

let buildEventUpdate = (bidID, userID, slot, bid) =>
    getUserInfo(userID)
        .then(userInfo => ({
            slot: slot,
            bid: bid,
            bidder: userInfo,
            index: bidID
        }));

let getUserInfo = userID =>
    database
        .getUser(userID)
        .then(user => ({
            userID: userID,
            firstName: user.first_name,
            lastName: user.last_name,
            company: user.company,
            table: user.table_number
        }));

/* STUB */

const getRandomArbitrary = (min, max) => Math.round((Math.random() * (max - min) + min) * 100) / 100

const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
const nameArray = ["Darwin", "Paris", "Jackie", "Dominick", "Abel", "Nelson", "Jeff", "Ivan", "Gene", "Bill", "William", "Myron", "Clayton", "Bryant", "Johnie", "Graig", "Elliott", "Dante", "Benjamin", "Brant", "Bertram", "Morgan", "Johnny", "Jonathan", "Wilfred", "Robert", "Robin", "Mohammed", "Joey", "Bradly", "Denver", "Elden", "Ryan", "Leigh", "Jc", "Asa", "Hayden", "Darrell", "Von", "Gary", "Augustus", "Alphonso", "Logan", "Leon", "Marquis", "Miguel", "Ignacio", "Don", "Derrick", "Jarod"]
const getRandomName = () => nameArray[getRandomInt(0,nameArray.length-1)]

const stubSlots = new Array(30)

function getStubSlotUpdate(i) {
  let index = i || getRandomInt(0,29);
  let cur = stubSlots[index] || {
    index: index,
    highestBid: 0
  };
  cur.highestBid += getRandomInt(1, 100);
  if(cur.highestBid > 5000) {
    stubSlots.forEach(e => e.highestBid = 0);    
  }
  cur.highestBidders = [{ firstName: getRandomName() }];
  stubSlots[index] = cur;
  return cur;
}

const stubEvents = new Array(29).fill().map(
  (e,i) => getStubEventUpdates()
)

function getStubEventUpdates() {
  return {
    "bidder": { firstName: getRandomName() },
    "bid": getRandomArbitrary(1, 100),
    "slot": getRandomInt(1,25)
  }
}

let getRandomUpdates = () => {
  let numUpdates = getRandomInt(1,5);
  return JSON.stringify({
    slots: new Array(numUpdates).fill().map((e,i) => getStubSlotUpdate(i)),
    events: new Array(numUpdates).fill().map((e,i) => getStubEventUpdates(i))
  })
}