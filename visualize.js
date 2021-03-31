require('dotenv/config');
const fetch = require('node-fetch');
const readline = require("readline");
const fs = require('fs');
const vega = require('vega');

// CONSTANTS
const API_BASE = 'https://www.ebimt.pro/covidApiAustria/';
const USER_BASE = API_BASE + 'user/';
const CUT_FACTOR = 1; // Determines how many data points are shown. If cut by two, only every 2nd dot will be graphed

// Parse command line args
const argv = process.argv.splice(2);
if(argv.length != 1) {
    console.error('No Bezirk name supplied!');
    console.error('*Usage:\nnode visualize.js name');
    console.error('\tname: Name of the Bezirk (county) for graph generation');
    process.exit(1);
}
var bezirkName = argv[0];

// Init console
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Check for connectivity
fetch(API_BASE + 'info')
.then(res => res.json())
.then(async (json) => {
    if(!process.env.API_USERNAME){
        console.log('!! No API_USERNAME specified in .env-file!')
        process.exit(1);
    }
    console.log('API Username: ' + process.env.API_USERNAME);
    
    // Fetch tokens
    var tokens;
    if(!process.env.API_REFRESH_TOKEN){
        tokens = await obtainAPIKey().catch(err => {
            console.log(err);
            process.exit(1);
        });
        tokens = {accessToken: tokens.accessToken.token, refreshToken: tokens.refreshToken};
        console.log('Refresh token: ' + tokens.refreshToken);
    }
    else {
        tokens = await refreshToken(process.env.API_USERNAME, process.env.API_REFRESH_TOKEN).catch(err => {
            console.log(err);
            console.log('!! Invalid refresh token in .env file!');
            process.exit(1);
        });
    }

    // Fetch all Bezirke
    var allBezirke = await fetchAllBezirke(tokens).catch(err => {
        console.log(err);
        process.exit(1);
    });
    allBezirke = allBezirke.results;
    
    // Fetch statistic entries
    var bezirkModel;
    for(let i = 0; i < allBezirke.length; i++) {
        if(allBezirke[i].name.toLowerCase() === bezirkName.toLowerCase()){
            bezirkModel = allBezirke[i];
            break;
        }
    }
    if(!bezirkModel){
        console.log('Bezirk with name \'' + bezirkName + '\' can\'t be found!');
        process.exit(1);
    }
    var statisticEntries = await fetchAllStatisticEntriesForBezirk(tokens, bezirkModel.gkz).catch(err => {
        console.log(err);
        process.exit(1);
    });
    statisticEntries = statisticEntries.results;


    /** Graph the statistics **/
    // Prepare data sets
    const totalCases = [];
    const newCases = [];
    const activeCases = [];
    const totalDeaths = [];
    const recoveredTotal = [];
    const sevenDayIncidence = [];
    for(let i = 0; i < statisticEntries.length; i++){
        var date = new Date(statisticEntries[i].date);
        totalCases.push({date: date, cases: statisticEntries[i].casesTotal});

        var active = statisticEntries[i].casesTotal - statisticEntries[i].recoveredTotal - statisticEntries[i].deathsTotal;
        activeCases.push({date: date, cases: active});

        totalDeaths.push({date: date, cases: statisticEntries[i].deathsTotal});
        recoveredTotal.push({date: date, cases: statisticEntries[i].recoveredTotal});
        sevenDayIncidence.push({date: date, cases: statisticEntries[i].SevenDayIncidence});
        newCases.push({date: date, cases: statisticEntries[i].casesToday});
    }

    // Write graphs (SVG)
    writeGraph("Total COVID-19 cases in 'Bezirk " + bezirkModel.name + "' (absolute)", "COVID-19 cases (absolute)", totalCases, CUT_FACTOR,
        bezirkModel.name + '_cumulated_cases.svg', () => console.log('Total graph written.'));
    writeGraph("Active COVID-19 cases in 'Bezirk " + bezirkModel.name + "' (absolute)", "Active COVID-19 cases (absolute)", activeCases, CUT_FACTOR,
        bezirkModel.name + '_active_cases.svg', () => console.log('Active graph written.'));
    writeGraph("Total COVID-19 deaths in 'Bezirk " + bezirkModel.name + "' (absolute)", "COVID-19 deaths (absolute)", totalDeaths, CUT_FACTOR,
        bezirkModel.name + '_total_deaths.svg', () => console.log('Deaths graph written.'));
    writeGraph("COVID-19 7-day-incidence in 'Bezirk " + bezirkModel.name + "' (absolute)", "7-day-incidence", sevenDayIncidence, CUT_FACTOR,
        bezirkModel.name + '_7_day_incidence.svg', () => console.log('7d incidence graph written.'));
    writeGraph("Daily new COVID-19 cases in 'Bezirk " + bezirkModel.name + "' (absolute)", "Daily new cases (absolute)", newCases, CUT_FACTOR,
        bezirkModel.name + '_daily_new_cases.svg', () => console.log('Daily new cases graph written.'));
    writeGraph("Recovered COVID-19 patients in 'Bezirk " + bezirkModel.name + "' (absolute)", "COVID-19 recovered count (absolute)", recoveredTotal, CUT_FACTOR,
        bezirkModel.name + '_recovered.svg', () => {
            console.log('Recovered graph written.');
            process.exit(0);
        });
})
.catch(err =>{
    console.log('!! No connection possible' + err);
    process.exit(1);
});

// Writes a SVG graph.
// title: Title above the whole graph
// yTitle: Title of the y axis
// data: Data to plot
// cutFactor: Factor for cutting data to cut down on mark points in the graph
// fileName: File name of generated graph (SVG)
// callback: Parameterless callback function
function writeGraph(title, yTitle, data, cutFactor, fileName, callback){
    var chartDefinition = require('./chartDefinition.json');
    chartDefinition.title.text = title;
    chartDefinition.axes[0].title = yTitle;
    chartDefinition.data[0].values = data;

    // Cut original data according to passed factor
    const cutData = [];
    for(let i = 0; i < data.length / cutFactor; i++){
        cutData.push(data[i * cutFactor]);
    }
    chartDefinition.data[1].values = cutData;

    // Write graph
    var view = new vega.View(vega.parse(chartDefinition)).renderer('none').initialize();
    view.toSVG()
    .then(svg => {
        fs.writeFile(fileName, svg, () => callback());
    })
    .catch(err => {
        console.log('Error while writing SVG graph:');
        console.log(err);
        throw err;
    });
}

// Fetches all statistic entries for a given Bezirk
async function fetchAllStatisticEntriesForBezirk(tokenPair, gkz) {
    return new Promise(async (resolve, reject) => {
        let status;
        fetch(API_BASE + 'statisticEntry?gkz=' + gkz, { headers: {'Token': tokenPair.accessToken} })
        .then(res => {
            status = res.status;
            return res.json();
        })
        .then(statisticEntryJson => {
            if(!statisticEntryJson || status != 200)
                return reject('Couldn\'t fetch statistic entries!');
            else
                return resolve(statisticEntryJson);
        })
        .catch(err => {
            return reject(err);
        });
    });
}

// Fetches a Bezirk model. GKZ = Gemeindekennzahl
async function fetchBezirk(tokenPair, gkz) {
    return new Promise(async (resolve, reject) => {
        let status;
        fetch(API_BASE + 'bezirk/' + gkz, { headers: {'Token': tokenPair.accessToken} })
        .then(res => {
            status = res.status;
            return res.json();
        })
        .then(bezirkJson => {
            if(!bezirkJson || status != 200)
                return reject('Couldn\'t fetch bezirk!');
            else
                return resolve(bezirkJson);
        })
        .catch(err => {
            return reject(err);
        });
    });
}

// Fetches all Bezirk models. GKZ = Gemeindekennzahl
async function fetchAllBezirke(tokenPair) {
    return new Promise(async (resolve, reject) => {
        let status;
        fetch(API_BASE + 'bezirk', { headers: {'Token': tokenPair.accessToken} })
        .then(res => {
            status = res.status;
            return res.json();
        })
        .then(bezirkJson => {
            if(!bezirkJson || status != 200)
                return reject('Couldn\'t fetch bezirke!');
            else
                return resolve(bezirkJson);
        })
        .catch(err => {
            return reject(err);
        });
    });
}

// Takes in a tokenPair and refreshes the access token.
async function refreshToken(userEmail, refreshToken) {
    return new Promise(async (resolve, reject) => {
        let status;
        fetch(USER_BASE + 'refreshToken', {method: 'POST',
            body: JSON.stringify({userEmail: userEmail, refreshToken: refreshToken}),
            headers: {
                "Content-Type": "application/json"
            }
        })
        .then(res => {
            status = res.status;
            return res.json();
        })
        .then(tokenJson => {
            if(!tokenJson || status != 200)
                return reject('!! Couldn\'t refresh tokens!');
            else
                return resolve({accessToken: tokenJson.accessToken.token, refreshToken: refreshToken});
        })
        .catch(err => {
            return reject(err);
        });
    });
}

// Asks for the user's password, obtains tokens.
async function obtainAPIKey() {
    return new Promise(async (resolve, reject) => {
        await rl.question("[*] API password: ", function(password) {
            let status;
            fetch(USER_BASE + 'login', {method: 'POST', 
                body: JSON.stringify({
                    email: process.env.API_USERNAME,
                    password: password
                }),
                headers: {
                    "Content-Type": "application/json"
                }
            })
            .then(res => {
                status = res.status;
                return res.json();
            })
            .then(tokenJson => {
                if(!tokenJson || tokenJson.error || status != 200)
                    return reject('!! Invalid password - could not obtain API key!' + (tokenJson.error ? ' Error: ' + tokenJson.error : ''));

                process.env['API_REFRESH_TOKEN'] = tokenJson.refreshToken;
                process.env['API_ACCESS_TOKEN'] = tokenJson.accessToken.token;
                return resolve(tokenJson);
            })
            .catch(err => {
                return reject(err);
            });
        });
    });
}
