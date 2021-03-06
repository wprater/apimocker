var express = require('express'),
		_ = require("underscore"),
		path = require("path"),
		apiMocker = {},
		defaults = {
			"port": "8888",
			"mockDirectory": "./mocks/",
			"output": false,
            "allowedDomains": ["*"],
			"webServices": {
				"get": {},
				"post": {}
			}
		};

apiMocker.createServer = function(options) {
	apiMocker.express = express();
	apiMocker.express.use(express.bodyParser());
	apiMocker.express.use(apiMocker.corsMiddleware);
	apiMocker.options = {};
	apiMocker.defaults = defaults;
	apiMocker.log = function(msg) {
		if (apiMocker.options.output + "" === "true") {
			console.log(msg);
		}
	};
	return apiMocker;
};

apiMocker.setConfigFile = function (file) {
	if (!file) {
			return apiMocker;
	} else if (path.sep !== file.substr(0,1)) {
		//relative path from command line
		apiMocker.configFilePath = path.resolve(process.cwd(), file);
	} else {
		apiMocker.configFilePath = file;
	}
	_.defaults(apiMocker.options, require(apiMocker.configFilePath), apiMocker.defaults);
	return apiMocker;
};

apiMocker.loadConfigFile = function() {
  if (apiMocker.configFilePath) {
      apiMocker.log("Loading config file: " + apiMocker.configFilePath);
      // Since the configFilePath can be set in different ways, 
      //	I may need to delete from cache in different ways.
      delete require.cache[apiMocker.configFilePath];
      delete require.cache[require.resolve(apiMocker.configFilePath)];
      _.extend(apiMocker.options, apiMocker.defaults, require(apiMocker.configFilePath));
      apiMocker.setRoutes(apiMocker.options.webServices);
      apiMocker.log("latency: " + apiMocker.options.latency);
  } else {
      apiMocker.log("No config file path set.");
  }
};

apiMocker.createAdminServices = function() {
	apiMocker.express.all("/admin/reload", function(req, res) {
		apiMocker.loadConfigFile();
		res.writeHead(200, {"Content-Type": "application/json"});
		res.end('{"configFilePath": "' + apiMocker.configFilePath + '", "reloaded": "true"}');
	});

	apiMocker.express.all("/admin/setMock", function(req, res) {
		var newRoute = {};
		if (req.body.serviceUrl && req.body.verb && req.body.mockFile) {
			apiMocker.log("Received JSON request: " + JSON.stringify(req.body));
			newRoute = req.body;
			newRoute.verb = newRoute.verb.toLowerCase();
		} else {
			newRoute.verb = req.param('verb').toLowerCase();
			newRoute.serviceUrl = req.param('serviceUrl');
			newRoute.mockFile = req.param('mockFile');
		}
		apiMocker.setRoute(newRoute);
		// also need to save in our webServices object.
		if (!apiMocker.options.webServices[newRoute.verb]) {
			apiMocker.options.webServices[newRoute.verb] = {};
		}
		apiMocker.options.webServices[newRoute.verb][newRoute.serviceUrl] = newRoute.mockFile;

		res.writeHead(200, {"Content-Type": "application/json"});
		res.end(JSON.stringify(newRoute));
	});
};

apiMocker.setRoutes = function(webServices) {
	var verbs = _.keys(webServices);
	_.each(verbs, function(verb) {
		var serviceKeys = _.keys(webServices[verb]);
		_.each(serviceKeys, function(key) {
			apiMocker.setRoute({
				"serviceUrl": key,
				"mockFile": webServices[verb][key],
				"verb": verb
			});
		});
	});
	// apiMocker.log(apiMocker.express.routes);
};

apiMocker.getMockPath = function(options) {
	apiMocker.log("Returning mock: " + options.verb.toUpperCase() + " " + options.serviceUrl + " : " +
			apiMocker.options.webServices[options.verb][options.serviceUrl]);
	return apiMocker.options.webServices[options.verb][options.serviceUrl];
};

// Sets the route for express, in case it was not set yet.
apiMocker.setRoute = function(options) {
	apiMocker.log("Setting route: " + options.verb.toUpperCase() + " " + options.serviceUrl + " : " + options.mockFile);
	apiMocker.express[options.verb]("/" + options.serviceUrl, function(req, res) {
		if (apiMocker.options.latency && apiMocker.options.latency > 0) {
			// apiMocker.log("Latency set to: " + apiMocker.options.latency);
			setTimeout(function() {
				res.sendfile(apiMocker.getMockPath(options), {root: apiMocker.options.mockDirectory});
			}, apiMocker.options.latency);
		} else {
			res.sendfile(apiMocker.getMockPath(options), {root: apiMocker.options.mockDirectory});
		}
	});
};

// CORS middleware
apiMocker.corsMiddleware = function(req, res, next) {
    res.header('Access-Control-Allow-Origin', apiMocker.options.allowedDomains);
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');

    next();
};

apiMocker.start = function (port) {
	port = port || apiMocker.options.port;
	apiMocker.createAdminServices();
	apiMocker.loadConfigFile();
	apiMocker.express.listen(port);
		
	apiMocker.log("Mock server listening on port " + port);
	return apiMocker;
};

// expose all the "public" methods.
exports.createServer = apiMocker.createServer;
exports.start = apiMocker.start;
exports.setConfigFile = apiMocker.setConfigFile;