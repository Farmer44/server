/**
 * @module jseBackup
 * @description 	Secondary backup and json data storage functions, used only by controller.js
 * <h5>Exported</h5>
 *	<ul>
 *		<li>runAtMidnight</li>
 *		<li>runAtMidday</li>
 *		<li>cleanNulls</li>
 *		<li>backupLedger</li>
 *		<li>resetBlockChainFile</li>
 *		<li>storeLogs</li>
 *	</ul>
*/

const JSE = global.JSE;
const fs = require('fs');
const jseAPI = require("./apifunctions.js");

/**
 * @method <h2>runAtMidnight</h2>
 * @description Resets daily stats at midnight each night, publicStats are pushed to dailyPublicStats
 */
function runAtMidnight() {
	const now = new Date();
	 // ...at 00:10:00 hours, 10 minutes extra in case of timing fault
	const night = new Date( now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 10, 0 ); // eslint-disable-line
	const msToMidnight = night.getTime() - now.getTime();
	console.log('runAtMidnight set for '+(Math.floor(msToMidnight /60000))+' mins');
	setTimeout(function() {
			// Push JSE.publicStats to dailyJSE.PublicStats
			JSE.publicStats.ts = new Date().getTime();
			JSE.jseDataIO.updatePublicStats();
			JSE.jseDataIO.getVariable('publicStats',function(latestStats) {
				JSE.jseDataIO.pushVariable('dailyPublicStats',latestStats,function(pushRef){ console.log('Pushed across publicStats to dailyPublicStats'); });
				JSE.jseDataIO.resetDailyStats();
			});
			runAtMidnight(); // Then, reset again next midnight.
	}, msToMidnight);
}

/**
 * @method <h2>runAtMidday</h2>
 * @description Runs subscription payments and notifications at midday each day
 */
function runAtMidday() {
	const now = new Date();
	// ...at 00:10:00 hours, 10 minutes extra in case of timing fault
	let noonObject;
	if (now.getHours() < 12) { // start it up later today if need be
		noonObject = new Date( now.getFullYear(), now.getMonth(), now.getDate(), 12, 10, 0 ); // eslint-disable-line
	} else {
		noonObject = new Date( now.getFullYear(), now.getMonth(), now.getDate() + 1, 12, 10, 0 ); // eslint-disable-line
	}
	const msToMidday = noonObject.getTime() - now.getTime();
	console.log('runAtMidday set for '+(Math.floor(msToMidday / 60000))+' mins');
	setTimeout(function() {
		runSubscriptions();
		runAtMidday(); // Then, reset again next midnight.
	}, msToMidday);
}

/**
 * @method <h2>runAt5pm</h2>
 * @description Runs autoresponder series
 */
function runAt5pm() {
	const now = new Date();
	let peakTimeObject;
	if (now.getHours() < 17) { // start it up later today if need be
		peakTimeObject = new Date( now.getFullYear(), now.getMonth(), now.getDate(), 17, 10, 0 ); // eslint-disable-line
	} else {
		peakTimeObject = new Date( now.getFullYear(), now.getMonth(), now.getDate() + 1, 17, 10, 0 ); // eslint-disable-line
	}
	const msToMidday = peakTimeObject.getTime() - now.getTime();
	console.log('runAtMidday set for '+(Math.floor(msToMidday / 60000))+' mins');
	setTimeout(function() {
		startAutoresponder();
		runAt5pm(); // Then, reset again next midnight.
	}, msToMidday);
}

/**
 * @method <h2>startAutoresponder</h2>
 * @description send out welcome email series
 */
function startAutoresponder() {
	JSE.jseDataIO.getVariable('nextUserID',function(endID) {
		const startID = endID - 30000; // only send to last 30k users, may need to increase if we get more than 30k users in a two week period
		JSE.jseDataIO.getAdminAccounts(startID,endID,function(users){
			Object.keys(users).forEach(function(i) {
				if (typeof users[i] === 'undefined' || users[i] === null) return;
				if (users[i].confirmed === true && !users[i].suspended) {
					if (users[i].noNewsletter) return;
					let aff = users[i].campaign.split(/[^0-9]/).join('');
					aff = parseFloat(aff);
					if (users[i].source !== 'referral' || (users[aff] && !users[aff].suspended)) { // check affiliate sending them wasn't suspended i.e. bots
						//users[i]
					}
				}
			});
		});
	});
}

/**
 * @method <h2>cleanNulls</h2>
 * @description moves all object data to an array and removes any null values
 * @param {object} firebaseObject this was from back when firebase was causing us formatting issues
 * @todo is this required/used now?
 */
function cleanNulls(firebaseObject) {
	const cleanArray = [];
	Object.keys(firebaseObject).forEach(function(i) {
		if (firebaseObject[i] !== null) {
			cleanArray.push(firebaseObject[i]);
		}
	});
	return cleanArray;
}

/**
 * @function <h2>runSubscriptions</h2>
 * @description Gather subscriptions information from merchantSales and send out warning email if due tomorrow
 */
function runSubscriptions() {
	const nowTS = new Date().getTime();
	let timeoutCount = 1;
	JSE.jseDataIO.getVariable('merchantSales/',function(merchantSales) {
		Object.keys(merchantSales).forEach(function(uid) {
			const uidSales = merchantSales[uid];
			Object.keys(uidSales).forEach(function(pushRef) {
				const uidSale = uidSales[pushRef];
				if (typeof uidSale.type !== 'undefined') {
					if (uidSale.type === 'recurring') {
						const payableDateProcessed = new Date(uidSale.payableDate).getTime();
						if (payableDateProcessed < (86400000 + nowTS) && typeof uidSale.cancelledTS === 'undefined') {
							setTimeout(function(uidSaleTO) { // only process one subscription every 30 seconds to avoid double spend
								processSubscription(uidSaleTO);
							}, timeoutCount, uidSale);
							timeoutCount += 30000;
						} else if (payableDateProcessed < (172800000 + nowTS) && uidSale.rebillFrequency !== 'daily' && typeof uidSale.cancelledTS === 'undefined') {
							JSE.jseFunctions.sendStandardEmail(uidSale.buyerEmail, 'Subscription Due', 'Please note your subscription reference: '+uidSale.reference+' is due tomorrow.<br><br>Your account will be debited '+uidSale.recurringPrice+' JSE<br><br>You can cancel this contract at any time by logging in to the panel');
						}
					} // reccurring sales
				}
			});
		});
	});
}

/**
 * @function <h2>processSubscription</h2>
 * @description Process any due and valid subscriptions via apiTransfer
 * @param {object} uidSale merchantSales/ object due for processing
 */
function processSubscription(uidSale) {
	JSE.jseDataIO.getCredentialsByUID(uidSale.buyerUID, function(buyer) {
		JSE.jseDataIO.getCredentialsByUID(uidSale.sellerUID, function(seller) {
			jseAPI.apiTransfer(buyer,seller,uidSale.recurringPrice,'Subscription: '+uidSale.item,false,function(jsonResult) {
				const returnObj = JSON.parse(jsonResult);
				if (returnObj.success === 1) {
					console.log('Processed subscription ref. '+uidSale.reference);
					// update datetime
					const now = new Date();
					let payableDate = {};
					if (uidSale.rebillFrequency === 'daily') {
						payableDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 11, 0, 0);
					} else if (uidSale.rebillFrequency === 'weekly') {
						payableDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 11, 0, 0);
					} else if (uidSale.rebillFrequency === 'monthly') {
						payableDate = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate(), 11, 0, 0);
					} else if (uidSale.rebillFrequency === 'annually') {
						payableDate = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate(), 11, 0, 0);
					}
					JSE.jseDataIO.setVariable('merchantSales/'+uidSale.reference+'/payableDate', payableDate);
					JSE.jseDataIO.setVariable('merchantPurchases/'+uidSale.purchaseReference+'/payableDate', payableDate);
				} else {
					cancelSubscription(uidSale);
				}
			});
		});
	});
}

/**
 * @function <h2>cancelSubscription</h2>
 * @description Cancell a subscription and notify both the seller and purchaser
 * @param {object} uidSale merchantSales/ object
 */
function cancelSubscription(uidSale) {
	// code duplicated in checkout.js
	const cancelledTS = new Date().getTime();
	JSE.jseDataIO.setVariable('merchantSales/'+uidSale.reference+'/cancelledTS', cancelledTS);
	JSE.jseDataIO.setVariable('merchantPurchases/'+uidSale.purchaseReference+'/cancelledTS', cancelledTS);
	const cancelHTML = 'Subscription reference: '+uidSale.reference+' has now been cancelled due to insufficient funds or a failed transaction. Please log in to the platform for further details.';
	JSE.jseDataIO.getUserByUID(uidSale.sellerUID, function(seller) {
		JSE.jseFunctions.sendStandardEmail(seller.email,'JSEcoin Subscription Cancellation',cancelHTML);
	});
	JSE.jseDataIO.getUserByUID(uidSale.buyerUID, function(buyer) {
		JSE.jseFunctions.sendStandardEmail(buyer.email,'JSEcoin Subscription Cancellation',cancelHTML);
	});
	return false;
}

/**
 * @method <h2>backupLedger</h2>
 * @description Backs up the current ledger of user balances to a JSON file in the data directory
 * @param {object} ledger the current working ledger
 */
function backupLedger(ledger) {
	const rightNow = new Date();
	const blockRef = JSE.jseDataIO.getBlockRef(JSE.blockID);
	fs.writeFile(JSE.dataDirectory+"ledger.json", JSON.stringify(ledger), function(){ });
	fs.writeFile(JSE.dataDirectory+"ledger"+blockRef+".json", JSON.stringify(ledger), function(){ });
}

/**
 * @method <h2>resetBlockChainFile</h2>
 * @description Finalizes the blockchain json file every time the blockchain hits 999 blocks
 */
function resetBlockChainFile() {
	const blockRef = JSE.jseDataIO.getBlockRef(JSE.blockID);
	//currentBlockChain = {};
	let previousBlockReference = blockRef - 1;
	if (previousBlockReference < 0) { previousBlockReference = 0; }
	JSE.jseDataIO.getVariable('blockChain/'+previousBlockReference,function(blockChain) {
		fs.writeFile(JSE.dataDirectory+"blockchain"+previousBlockReference+".json", JSON.stringify(cleanNulls(blockChain)), function() { });
	});
}

/**
 * @method <h2>storeLogs</h2>
 * @description Secondary backup facility, jseBackup.storeLogs(); is called from the modules/blockchain.js file every 30 seconds.
		If we change the block time we need to change the  && rightNow.getSeconds() >= 29 bit
		Uses setTimouts to log data and distribute memory allocation. Not optimized because data is constantly duplicated.
		Need to really append new data as opposed to making hundreds of files.
		Uses A an B files using fileAddition so that if one file gets corrupted during writing out we have the previous one.
*/

function storeLogs() {
	const rightNow = new Date();
	const yymmdd = rightNow.toISOString().slice(2,10).replace(/-/g,"");
	let fileAddition = false;
	if (rightNow.getSeconds() >= 29 && rightNow.getMinutes() === 1 && (rightNow.getHours() === 1 || rightNow.getHours() === 5 || rightNow.getHours() === 9 || rightNow.getHours() === 13 || rightNow.getHours() === 17 || rightNow.getHours() === 21)) {
		fileAddition = 'A';
	} else if (rightNow.getSeconds() >= 29 && rightNow.getMinutes() === 1 && (rightNow.getHours() === 0 || rightNow.getHours() === 4 || rightNow.getHours() === 8 || rightNow.getHours() === 12 || rightNow.getHours() === 16 || rightNow.getHours() === 20)) {
		fileAddition = 'B';
	}
	if (fileAddition) {
		setTimeout(function() {
			JSE.jseDataIO.buildLedger(function(ledger) {
				fs.writeFile(JSE.logDirectory+"ledger"+yymmdd+fileAddition+".json", JSON.stringify(ledger), function(){});
			});
		}, 30000);
		setTimeout(function() {
			JSE.jseDataIO.getVariable('credentials',function(credentials) {
				fs.writeFile(JSE.logDirectory+"credentials"+yymmdd+fileAddition+".json", JSON.stringify(credentials), function(){});
			});
		}, 150000);
		setTimeout(function() {
			JSE.jseDataIO.getVariable('account',function(account) {
				fs.writeFile(JSE.logDirectory+"account"+yymmdd+fileAddition+".json", JSON.stringify(account), function(){});
			});
		}, 210000);
		if (rightNow.getHours() === 1 || rightNow.getHours() === 8 || rightNow.getHours() === 13 || rightNow.getHours() === 20) {
			setTimeout(function() {
				JSE.jseDataIO.getVariable('exported',function(exported) {
					fs.writeFile(JSE.logDirectory+"exported"+yymmdd+fileAddition+".json", JSON.stringify(exported), function(){});
				});
			}, 90000);
		}
		if (rightNow.getHours() === 1 || rightNow.getHours() === 12) {
			setTimeout(function() {
				JSE.jseDataIO.getVariable('history',function(history) {
					fs.writeFile(JSE.logDirectory+"history"+yymmdd+fileAddition+".json", JSON.stringify(history), function(){});
				});
			}, 270000);
			setTimeout(function() {
				JSE.jseDataIO.getVariable('siteIDs',function(siteIDs) {
					fs.writeFile(JSE.logDirectory+"siteIDs"+yymmdd+fileAddition+".json", JSON.stringify(siteIDs), function(){});
				});
			}, 330000);
			setTimeout(function() {
				JSE.jseDataIO.getVariable('subIDs',function(subIDs) {
					fs.writeFile(JSE.logDirectory+"subIDs"+yymmdd+fileAddition+".json", JSON.stringify(subIDs), function(){});
				});
			}, 390000);
			setTimeout(function() {
				JSE.jseDataIO.getVariable('statsTotal',function(statsTotal) {
					fs.writeFile(JSE.logDirectory+"statsTotal"+yymmdd+fileAddition+".json", JSON.stringify(statsTotal), function(){});
				});
			}, 450000);
			setTimeout(function() {
				JSE.jseDataIO.getVariable('merchantSales',function(merchantSales) {
					fs.writeFile(JSE.logDirectory+"merchantSales"+yymmdd+fileAddition+".json", JSON.stringify(merchantSales), function(){});
				});
			}, 510000);
			setTimeout(function() {
				JSE.jseDataIO.getVariable('merchantPurchases',function(merchantPurchases) {
					fs.writeFile(JSE.logDirectory+"merchantPurchases"+yymmdd+fileAddition+".json", JSON.stringify(merchantPurchases), function(){});
				});
			}, 570000);
		}
	}
}


module.exports = {
	runAtMidnight, runAtMidday, runAt5pm, cleanNulls, backupLedger, resetBlockChainFile, storeLogs,
};
