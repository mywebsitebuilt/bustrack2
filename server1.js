const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const app = express();

app.use(express.json());
app.use(cors());

mongoose.connect(
    'mongodb+srv://sfayazmr:Abcdef067@cluster01.ibbs2.mongodb.net/bustrack?retryWrites=true&w=majority&appName=Cluster01',
    { useNewUrlParser: true, useUnifiedTopology: true }
).then(() => console.log('Connected to MongoDB'))
    .catch((error) => console.error('Error connecting to MongoDB:', error));



// --- Location Model ---
const locationSchema = new mongoose.Schema({
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now },
    formattedTimestamp: { type: String }, // Added formatted timestamp
    busNumber: { type: String }, // Added bus number
    busDispatched: { type: Boolean },
    dispatchTime: { type: Date },
    movedFromLast: { type: Boolean },
    reachedStop: { type: String },
    reachedTime: { type: Date },
    movedFromStop: { type: String },
    movedFromStopTime: { type: Date },
    currentStopIndex: { type: Number },
    stopStatuses: [{
        locationName: String,
        status: { type: String, enum: ['pending', 'reached', 'moved'] },
        arrivalTime: { type: Date },
        departureTime: { type: Date },
    }],
    estimatedArrivalTimes: [String], // Added estimatedArrivalTimes field
    isTracking: { type: Boolean, default: false }, // Added isTracking field to location
}, { collection: 'LattestLocations' }); // Changed collection name here
const Location = mongoose.model("Location", locationSchema);



// --- Route Model ---
const routeSchema = new mongoose.Schema({
    busNumber: { type: String, required: true, unique: true },
    routeName: String,
    startTimeMorning: String, // Added startTimeMorning
    stops: [
        {
            locationName: { type: String, required: true },
            latitude: { type: Number, required: true },
            longitude: { type: Number, required: true },
            distanceFromPrevious: { type: Number, default: 0 },
            estimatedTimeFromPrevious: { type: Number, default: 0 },
            arrivalTimeMorning: String, // Added arrivalTimeMorning for each stop
        },
    ],
});
const Route = mongoose.model("Route", routeSchema);

// --- Driver Model ---
const driverSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    busNumber: { type: String, required: true },
    isTracking: { type: Boolean, default: false },
    route: { type: mongoose.Schema.Types.ObjectId, ref: 'Route' },
    lastLocation: { type: mongoose.Schema.Types.ObjectId, ref: 'Location' } // Add lastLocation field
});
const Driver = mongoose.model("Driver", driverSchema);



// --- JWT Secret ---
const DRIVER_JWT_SECRET = 'driver-secret-key';

// --- Authentication Middleware for Driver Routes ---
const authenticateDriver = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        console.log('Token from request:', token);
        if (!token) {
            return res.status(401).json({ message: 'Driver authentication required' });
        }
        const decoded = jwt.verify(token, DRIVER_JWT_SECRET);
        console.log('Decoded token:', decoded);
        const driver = await Driver.findById(decoded.driverId).populate('route').populate('lastLocation'); // Populate lastLocation
        console.log('Driver from database:', driver);
        if (!driver) {
            return res.status(401).json({ message: 'Invalid driver token' });
        }
        req.driver = driver;
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(401).json({ message: 'Invalid driver token' });
    }
};

// --- Driver Authentication and Location Tracking ---

app.post('/api/driver/login', async (req, res) => {
    console.log("Received body for /api/driver/login:");
    console.log(JSON.stringify(req.body, null, 2));
    try {
        const { username, password } = req.body;
        const driver = await Driver.findOne({ username });
        if (!driver || !(await bcrypt.compare(password, driver.password))) {
            return res.status(401).json({ message: 'Invalid driver credentials' });
        }
        const token = jwt.sign({ driverId: driver._id }, DRIVER_JWT_SECRET, { expiresIn: '2h' });
        res.json({ token, driverId: driver._id, busNumber: driver.busNumber, message: 'Driver login successful' });
    } catch (error) {
        console.error('Driver login error:', error);
        res.status(500).json({ message: 'Failed to login driver' });
    }
});

// Start Tracking
app.post('/api/driver/tracking/start', authenticateDriver, async (req, res) => {
    console.log("Received body for /api/driver/tracking/start:");
    console.log(JSON.stringify(req.body, null, 2));
    try {
        req.driver.isTracking = true;
        await req.driver.save();
        res.json({ message: 'Tracking started' });
    } catch (error) {
        console.error('Error starting tracking:', error);
        res.status(500).json({ message: 'Failed to start tracking' });
    }
});

// Stop Tracking
app.post('/api/driver/tracking/stop', authenticateDriver, async (req, res) => {
    console.log("Received body for /api/driver/tracking/stop:");
    console.log(JSON.stringify(req.body, null, 2));
    try {
        req.driver.isTracking = false;
        await req.driver.save();
        res.json({ message: 'Tracking stopped' });
    } catch (error) {
        console.error('Error stopping tracking:', error);
        res.status(500).json({ message: 'Failed to stop tracking' });
    }
});

// Location Update (Basic - keeping for potential simpler updates)
app.post('/api/driver/location', authenticateDriver, async (req, res) => {
    console.log("Received body for /api/driver/location:");
    console.log(JSON.stringify(req.body, null, 2));
    try {
        const { latitude, longitude } = req.body;
        if (!req.driver.isTracking) {
            return res.status(400).json({ message: 'Driver tracking is not active' });
        }
        const newLocation = new Location({
            driver: req.driver._id,
            latitude,
            longitude,
            busNumber: req.driver.busNumber, // Include bus number
            isTracking: true // When actively sending location, isTracking should be true
        });
        await newLocation.save();

        // Update the driver's lastLocation reference
        req.driver.lastLocation = newLocation._id;
        await req.driver.save();

        res.json({ message: 'Location updated', location: newLocation });
    } catch (error) {
        console.error('Error updating location:', error);
        res.status(500).json({ message: 'Failed to update location' });
    }
});

// Tracking Data Update (Receives comprehensive tracking info)
app.post('/api/driver/tracking/data', authenticateDriver, async (req, res) => {
    console.log("Received body for /api/driver/tracking/data:");
    console.log(JSON.stringify(req.body, null, 2));
    try {
        const {
            latitude,
            longitude,
            timestamp,
            busDispatched,
            dispatchTime,
            movedFromLast,
            reachedStop,
            reachedTime,
            movedFromStop,
            movedFromStopTime,
            currentStopIndex,
            stopStatuses,
            estimatedArrivalTimes,
            isTracking // Get isTracking status from the request body
        } = req.body;

        // Update driver's isTracking status based on received data
        req.driver.isTracking = isTracking !== undefined ? isTracking : req.driver.isTracking;
        await req.driver.save();

        const formattedTimestamp = timestamp ? new Date(timestamp).toLocaleString('en-IN', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }) : new Date().toLocaleString('en-IN', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        const newLocation = new Location({
            driver: req.driver._id,
            latitude,
            longitude,
            timestamp: timestamp ? new Date(timestamp) : new Date(),
            formattedTimestamp: formattedTimestamp, // Save formatted timestamp
            busNumber: req.driver.busNumber, // Include Bus Number
            busDispatched,
            dispatchTime: dispatchTime ? new Date(dispatchTime) : undefined,
            movedFromLast,
            reachedStop,
            reachedTime: reachedTime ? new Date(reachedTime) : undefined,
            movedFromStop,
            movedFromStopTime: movedFromStopTime ? new Date(movedFromStopTime) : undefined,
            currentStopIndex,
            stopStatuses: stopStatuses ? stopStatuses.map(s => ({
                locationName: s.locationName,
                status: s.status,
                arrivalTime: s.arrivalTime ? new Date(s.arrivalTime) : undefined,
                departureTime: s.departureTime ? new Date(s.departureTime) : undefined,
            })) : [],
            estimatedArrivalTimes: estimatedArrivalTimes || [], // Save estimatedArrivalTimes
            isTracking: req.driver.isTracking // Save the current tracking status in the location data
        });
        await newLocation.save();

        req.driver.lastLocation = newLocation._id;
        await req.driver.save();

        res.json({ message: 'Tracking data received and saved', data: newLocation });
    } catch (error) {
        console.error('Error saving tracking data:', error);
        res.status(500).json({ message: 'Failed to save tracking data' });
    }
});

// Get Route Details for Driver
app.get('/api/driver/route', authenticateDriver, async (req, res) => {
    console.log("Received body for /api/driver/route:"); // Typically no body for GET
    console.log(JSON.stringify(req.body, null, 2));
    try {
        if (!req.driver.route) {
            return res.status(404).json({ message: 'Driver is not assigned to a route' });
        }
        const route = await Route.findById(req.driver.route);
        res.json(route);
    } catch (error) {
        console.error("Error getting driver's route", error);
        res.status(500).json({ message: "Failed to get driver's route" });
    }
});

// Get Latest Location for a Driver (for user view)
app.get('/api/user/driver/:driverId/latest-location', async (req, res) => {
    console.log(`Received body for /api/user/driver/${req.params.driverId}/latest-location:`); // Typically no body for GET
    console.log(JSON.stringify(req.body, null, 2));
    const { driverId } = req.params;
    try {
        const driver = await Driver.findById(driverId).populate('lastLocation').populate({
            path: 'route',
            model: 'Route'
        });

        if (!driver) {
            return res.status(404).json({ message: 'Driver not found' });
        }

        if (driver.lastLocation) {
            const locationData = {
                latitude: driver.lastLocation.latitude,
                longitude: driver.lastLocation.longitude,
                timestamp: driver.lastLocation.timestamp,
                formattedTimestamp: driver.lastLocation.formattedTimestamp,   // Include the formatted timestamp
                busNumber: driver.busNumber,
                route: driver.route,
                busDispatched: driver.lastLocation.busDispatched,
                dispatchTime: driver.lastLocation.dispatchTime,
                movedFromLast: driver.lastLocation.movedFromLast,
                reachedStop: driver.lastLocation.reachedStop,
                reachedTime: driver.lastLocation.reachedTime,
                movedFromStop: driver.lastLocation.movedFromStop,
                movedFromStopTime: driver.lastLocation.movedFromStopTime,
                currentStopIndex: driver.lastLocation.currentStopIndex,
                stopStatuses: driver.lastLocation.stopStatuses,
                estimatedArrivalTimes: driver.lastLocation.estimatedArrivalTimes, // Include estimatedArrivalTimes
                isTracking: driver.isTracking // Send the driver's current tracking status
            };
            res.json(locationData);
        } else {
            res.status(404).json({ message: 'Location not found for this driver' });
        }
    } catch (error) {
        console.error('Error fetching latest location:', error);
        res.status(500).json({ message: 'Failed to fetch latest location' });
    }
});

// Start Server
const port = 5001;
app.listen(port, () => console.log(`Server running on port ${port}`));