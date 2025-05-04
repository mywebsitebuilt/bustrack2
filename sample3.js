const mongoose = require('mongoose');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const port = 5004; // Or any port you prefer

// Middleware to parse JSON bodies
app.use(bodyParser.json());
app.use(cors())
// MongoDB connection
mongoose.connect('mongodb+srv://sfayazmr:Abcdef067@cluster01.ibbs2.mongodb.net/bustrack?retryWrites=true&w=majority&appName=Cluster01', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
    .then(() => console.log('Connected to MongoDB...'))
    .catch(err => console.error('Could not connect to MongoDB...', err));

// Schemas
const driverSchema = new mongoose.Schema({
    username: String,
    password: String,
    busNumber: String,
    isTracking: Boolean,
    route: mongoose.Schema.Types.ObjectId,
    currentRouteProgress: Object
});

const routeSchema = new mongoose.Schema({
    busNumber: mongoose.Schema.Types.ObjectId, // Stores driver's _id
    routeName: String,
    stops: Array,
    startTimeMorning: String,
});

// Models
const Driver = mongoose.model('Driver', driverSchema);
const Route = mongoose.model('Route', routeSchema);

// Function: Find route based on driver's _id
async function getRouteByDriverUsername(username) {
    try {
        const driver = await Driver.findOne({ username });

        if (!driver) {
            console.log('❌ Driver not found.');
            return null;
        }

        console.log(`✅ Driver found: ${driver.username}, ID: ${driver._id}`);

        const route = await Route.findOne({ busNumber: driver._id });

        if (!route) {
            console.log(`❌ No route found for driver ${driver.username}`);
            return null;
        }

        console.log(`✅ Route found for ${driver.username}:`);
        console.log(route);
        return route;

    } catch (err) {
        console.error('Error:', err);
        return null;
    }
}

// Express route to get route data by driver username
app.get('/route/:username', async (req, res) => {
    const driverUsername = req.params.username;
    const routeData = await getRouteByDriverUsername(driverUsername);

    if (routeData) {
        res.json(routeData);
    } else {
        res.status(404).json({ error: 'Route not found for the driver' });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

