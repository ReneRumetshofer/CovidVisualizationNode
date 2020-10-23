# COVID-19 case visualization for Austria in Node.js
## What's it about?
This Node app accesses the official statistics of COVID-19 cases in Austria (per county level) via [ebimt.pro](https://www.ebimt.pro) COVID-19 API
and generates SVG graphs based on this data.
![Total cases](https://github.com/ReneRumetshofer/CovidVisualizationNode/blob/main/img/Amstetten_cumulated.png?raw=true "Total cases graph")
![Active cases](https://github.com/ReneRumetshofer/CovidVisualizationNode/blob/main/img/Amstetten_active.png?raw=true "Active cases graph")

## Get started
- Register an account at the [ebimt.pro](https://www.ebimt.pro) COVID-19 API
- Clone this repository and create a `.env` file in it. The following entries are needed:
	- API_USERNAME: Username of the API user
	- **OPTIONAL** (to not get queried for the API user's password every time):
		- API_REFRESH_TOKEN: The main API token for obtaining access tokens
- Run `npm install`
- Run the app: `node visualize.js <Name of Bezirk>`
- The graphs will be created in the folder!

## License / Terms of use
Feel free to use, change or redistribute this code; no mentioning needed.