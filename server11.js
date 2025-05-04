const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json()); // Required to parse JSON bodies

// 1. Define the Location Schema
const locationSchema = new mongoose.Schema({
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', required: false },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now },
    busNumber: { type: String }, // Added busNumber
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
    isTracking: { type: Boolean, default: false }, // Added isTracking
}, { collection: 'LattestLocations' });

// 2. Create the Location Model
const Location = mongoose.model('Location', locationSchema);

// 3. Connect to MongoDB
mongoose.connect(
    'mongodb+srv://sfayazmr:Abcdef067@cluster01.ibbs2.mongodb.net/bustrack?retryWrites=true&w=majority&appName=Cluster01',
    { useNewUrlParser: true, useUnifiedTopology: true }
);

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
    console.log('Connected to MongoDB');
});

// 4. GET API: Fetch and Print Latest Location
app.get('/location/:busNumber', async (req, res) => {
    const busNumber = req.params.busNumber;

    try {
        const latestBusLocation = await Location.findOne({ busNumber }).sort({ _id: -1 });

        if (latestBusLocation) {
            res.json({
                message: `Latest location for bus ${busNumber} fetched successfully`,
                data: latestBusLocation
            });
        } else {
            res.status(404).json({ message: `No data found for bus number: ${busNumber}` });
        }
    } catch (error) {
        console.error(`Error fetching location for bus ${busNumber}:`, error);
        res.status(500).json({ message: "Error fetching data", error: error.message });
    }
});

// 5. POST API: Receive and Log Driver Tracking Data
app.post('/api/driver/tracking/data', async (req, res) => {
    try {
        console.log("Received body for /api/driver/tracking/data:\n", JSON.stringify(req.body, null, 2));

        //  Include isTracking from the request body.  Important!
        const {
            latitude,
            longitude,
            busNumber,
            busDispatched,
            dispatchTime,
            movedFromLast,
            reachedStop,
            reachedTime,
            movedFromStop,
            movedFromStopTime,
            currentStopIndex,
            stopStatuses,
            isTracking  // <----  Grab isTracking from the request
        } = req.body;

        // Create a new Location object.
        const location = new Location({
            latitude,
            longitude,
            busNumber, // Include the busNumber
            busDispatched,
            dispatchTime,
            movedFromLast,
            reachedStop,
            reachedTime,
            movedFromStop,
            movedFromStopTime,
            currentStopIndex,
            stopStatuses,
            isTracking // <---- Store the isTracking value
        });

        // Save the location data to the database
        await location.save();

        res.status(200).json({ message: "Tracking data received and saved successfully", data: location }); //returning the saved data
    } catch (error) {
        console.error("Error processing tracking data:", error);
        res.status(500).json({ message: "Failed to process tracking data", error: error.message });
    }
});

// 6. Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
