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

// User Model (your existing model)
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    learningLevel: { type: String, default: "beginner" },
    translationHistory: { type: Array, default: [] },
    quizResults: { type: Array, default: [] },
    timestamps: { type: Array, default: [] },
    loginStreak: { type: Number, default: 1 },
    lastLoginDate: { type: String, default: new Date().toISOString().split("T")[0] },
    resetPasswordToken: String,
    resetPasswordExpires: Date,
});
const User = mongoose.model("User", userSchema);

// Admin Model (for admin users)
const adminSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
});
const Admin = mongoose.model("Admin", adminSchema);

// Driver Model
const driverSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    busNumber: { type: String, required: true },
    // You can add more driver-specific details here if needed (e.g., name, contact)
});
const Driver = mongoose.model("Driver", driverSchema);

// Route Model
const routeSchema = new mongoose.Schema({
    busNumber: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Driver' }, // Link route to a specific bus, changed to ObjectId and ref
    routeName: String, // Optional descriptive name for the route
    stops: [
        {
            locationName: { type: String, required: true },
            latitude: { type: Number, required: true },
            longitude: { type: Number, required: true },
            estimatedTimeFromPrevious: { type: Number, default: 0 }, // Distance to this stop from the previous (in minutes)
            arrivalTimeMorning: String, // Added for morning arrival time
        },
    ],
    startTimeMorning: String, // Added: Overall start time for the morning route
});
const Route = mongoose.model("Route", routeSchema);

// --- Authentication Middleware for Admin Routes ---
const authenticateAdmin = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const decoded = jwt.verify(token, 'your-admin-secret-key'); // Use a strong, env-based secret
        const admin = await Admin.findOne({ username: decoded.username });

        if (!admin) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        req.admin = admin;
        next();
    } catch (error) {
        res.status(401).json({ message: 'Invalid token' });
    }
};

// --- Admin Authentication Endpoints ---
app.post("/api/admin/register", async (req, res) => {
    try {
        const { username, password } = req.body;

        const existingAdmin = await Admin.findOne({ username });
        if (existingAdmin) {
            return res.status(400).json({ message: "Admin username already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newAdmin = new Admin({ username, password: hashedPassword });
        await newAdmin.save();

        res.status(201).json({ message: "Admin registered successfully" });
    } catch (error) {
        console.error("Admin registration error:", error);
        res.status(500).json({ message: "An error occurred during admin registration" });
    }
});

app.post("/api/admin/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        const admin = await Admin.findOne({ username });
        if (!admin) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        const isValid = await bcrypt.compare(password, admin.password);
        if (!isValid) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        const token = jwt.sign({ username: admin.username }, 'your-admin-secret-key', { expiresIn: '1h' }); // Use a strong, env-based secret
        res.json({ token, username: admin.username });
    } catch (error) {
        console.error("Admin login error:", error);
        res.status(500).json({ message: "An error occurred during admin login" });
    }
});

// --- Existing User Authentication Endpoints (register, login, forgot-password, updateUser, user) ---
// (Keep your existing user-related endpoints as they are)
app.post("/api/register", async (req, res) => { /* ... your existing register code ... */ });
app.post("/api/login", async (req, res) => { /* ... your existing login code ... */ });
app.post("/api/forgot-password", async (req, res) => { /* ... your existing forgot-password code ... */ });
app.put("/api/updateUser", async (req, res) => { /* ... your existing updateUser code ... */ });
app.get("/api/user", async (req, res) => { /* ... your existing user code ... */ });

// --- Admin Specific Endpoints (protected by authenticateAdmin middleware) ---

// Create Bus Driver
app.post("/api/admin/drivers", authenticateAdmin, async (req, res) => {
    try {
        const { username, password, busNumber } = req.body;

        const existingDriver = await Driver.findOne({ username });
        if (existingDriver) {
            return res.status(400).json({ message: "Driver username already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newDriver = new Driver({ username, password: hashedPassword, busNumber });
        await newDriver.save();

        res.status(201).json({ message: "Driver created successfully", driver: newDriver });
    } catch (error) {
        console.error("Error creating driver:", error);
        res.status(500).json({ message: "An error occurred while creating the driver" });
    }
});

// Get All Drivers
app.get("/api/admin/drivers", authenticateAdmin, async (req, res) => {
    try {
        const drivers = await Driver.find();
        res.json(drivers);
    } catch (error) {
        console.error("Error fetching drivers:", error);
        res.status(500).json({ message: "An error occurred while fetching drivers" });
    }
});

// Get Single Driver
app.get("/api/admin/drivers/:id", authenticateAdmin, async (req, res) => {
    try {
        const driverId = req.params.id;
        const driver = await Driver.findById(driverId);
        if (!driver) {
            return res.status(404).json({ message: "Driver not found" });
        }
        res.json(driver);
    } catch (error) {
        console.error("Error fetching driver:", error);
        res.status(500).json({ message: "An error occurred while fetching the driver" });
    }
});

// Update Driver
app.put("/api/admin/drivers/:id", authenticateAdmin, async (req, res) => {
    try {
        const { username, password, busNumber } = req.body;
        const driverId = req.params.id;

        const existingDriver = await Driver.findById(driverId);
        if (!existingDriver) {
            return res.status(404).json({ message: "Driver not found" });
        }

        //update username and busNumber
        existingDriver.username = username;
        existingDriver.busNumber = busNumber;
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            existingDriver.password = hashedPassword;
        }


        await existingDriver.save();
        res.json({ message: "Driver updated successfully", driver: existingDriver });
    } catch (error) {
        console.error("Error updating driver:", error);
        res.status(500).json({ message: "An error occurred while updating the driver" });
    }
});

// Delete Driver
app.delete("/api/admin/drivers/:id", authenticateAdmin, async (req, res) => {
    try {
        const driverId = req.params.id;
        const deletedDriver = await Driver.findByIdAndDelete(driverId);
        if (!deletedDriver) {
            return res.status(404).json({ message: "Driver not found" });
        }
        res.json({ message: "Driver deleted successfully" });
    } catch (error) {
        console.error("Error deleting driver:", error);
        res.status(500).json({ message: "An error occurred while deleting the driver" });
    }
});

// Define Bus Route
app.post("/api/admin/routes", authenticateAdmin, async (req, res) => {
    try {
        const { busNumber, routeName, stops, startTimeMorning } = req.body;

        const driver = await Driver.findOne({ busNumber: busNumber });
        if (!driver) {
            return res.status(400).json({ message: `Driver with bus number ${busNumber} does not exist.` });
        }

        if (!Array.isArray(stops) || stops.length < 2) {
            return res.status(400).json({ message: "A route must have at least two stops." });
        }

        // Validate that startTimeMorning and startTimeEvening are provided
        if (!startTimeMorning) {
            return res.status(400).json({ message: "Both startTimeMorning and startTimeEvening are required." });
        }

        let calculatedStops = [];
        let morningArrivalTime = startTimeMorning;

        for (const stop of stops) {
            if (!stop.locationName || typeof stop.latitude !== 'number' || typeof stop.longitude !== 'number') {
                return res.status(400).json({ message: "Each stop must have a location name, latitude, and longitude." });
            }

            // Convert HH:MM string to minutes
            const [hours, minutes] = stop.estimatedTimeFromPrevious ? stop.estimatedTimeFromPrevious.split(':').map(Number) : [0, 0];
            const estimatedMinutes = (hours || 0) * 60 + (minutes || 0);

            // Parse the previous arrival time
            let morningArrivalTimeObj = new Date(`2000-01-01T${morningArrivalTime}`);

            // Add the estimated time (in minutes)
            morningArrivalTimeObj = new Date(morningArrivalTimeObj.getTime() + estimatedMinutes * 60000);
            // Format back to HH:MM
            const formatTime = (date) => {
                const hours = date.getHours().toString().padStart(2, '0');
                const minutes = date.getMinutes().toString().padStart(2, '0');
                return `${hours}:${minutes}`;
            };

            stop.arrivalTimeMorning = formatTime(morningArrivalTimeObj);
            stop.estimatedTimeFromPrevious = estimatedMinutes; // Save as number of minutes
            calculatedStops.push(stop);
            morningArrivalTime = stop.arrivalTimeMorning; //update for next stop
        }
        const newRoute = new Route({ busNumber: driver._id, routeName, stops: calculatedStops, startTimeMorning }); //changed busNumber
        await newRoute.save();

        res.status(201).json({ message: "Route created successfully", route: newRoute });
    } catch (error) {
        console.error("Error creating route:", error);
        res.status(500).json({ message: "An error occurred while creating the route" });
    }
});

// Get All Routes (Optional for Admin Interface)
app.get("/api/admin/routes", authenticateAdmin, async (req, res) => {
    try {
        //const routes = await Route.find().populate('busNumber'); // Populate to get bus details 	-- changed
        const routes = await Route.find().populate({
            path: 'busNumber',
            model: 'Driver'
        });
        res.json(routes);
    } catch (error) {
        console.error("Error fetching routes:", error);
        res.status(500).json({ message: "An error occurred while fetching routes" });
    }
});

// Get Single Route
app.get("/api/admin/routes/:id", authenticateAdmin, async (req, res) => {
    try {
        const routeId = req.params.id;
        const route = await Route.findById(routeId).populate({
            path: 'busNumber',
            model: 'Driver'
        });
        if (!route) {
            return res.status(404).json({ message: "Route not found" });
        }
        res.json(route);
    } catch (error) {
        console.error("Error fetching route:", error);
        res.status(500).json({ message: "An error occurred while fetching the route" });
    }
});

// Update Route
app.put("/api/admin/routes/:id", authenticateAdmin, async (req, res) => {
    try {
        const { busNumber, routeName, stops, startTimeMorning } = req.body;
        const routeId = req.params.id;

        const existingRoute = await Route.findById(routeId);
        if (!existingRoute) {
            return res.status(404).json({ message: "Route not found" });
        }
        const driver = await Driver.findOne({ busNumber: busNumber });
        if (!driver) {
            return res.status(400).json({ message: `Driver with bus number ${busNumber} does not exist.` });
        }

        if (!Array.isArray(stops) || stops.length < 2) {
            return res.status(400).json({ message: "A route must have at least two stops." });
        }
        // Validate that startTimeMorning and startTimeEvening are provided
        if (!startTimeMorning) {
            return res.status(400).json({ message: "Both startTimeMorning and startTimeEvening are required." });
        }

        let calculatedStops = [];
        let morningArrivalTime = startTimeMorning;
        for (const stop of stops) {
            if (!stop.locationName || typeof stop.latitude !== 'number' || typeof stop.longitude !== 'number') {
                return res.status(400).json({ message: "Each stop must have a location name, latitude, and longitude." });
            }
            // Convert HH:MM string to minutes
            const [hours, minutes] = stop.estimatedTimeFromPrevious ? stop.estimatedTimeFromPrevious.split(':').map(Number) : [0, 0];
            const estimatedMinutes = (hours || 0) * 60 + (minutes || 0);

            let morningArrivalTimeObj = new Date(`2000-01-01T${morningArrivalTime}`);

            // Add the estimated time (in minutes)
            morningArrivalTimeObj = new Date(morningArrivalTimeObj.getTime() + estimatedMinutes * 60000);

            // Format back to HH:MM
            const formatTime = (date) => {
                const hours = date.getHours().toString().padStart(2, '0');
                const minutes = date.getMinutes().toString().padStart(2, '0');
                return `${hours}:${minutes}`;
            };
            stop.arrivalTimeMorning = formatTime(morningArrivalTimeObj);
            stop.estimatedTimeFromPrevious = estimatedMinutes; // Save as number of minutes
            calculatedStops.push(stop);
            morningArrivalTime = stop.arrivalTimeMorning;
        }
        existingRoute.busNumber = driver._id; 	//changed
        existingRoute.routeName = routeName;
        existingRoute.stops = calculatedStops;
        existingRoute.startTimeMorning = startTimeMorning;

        await existingRoute.save();
        res.json({ message: "Route updated successfully", route: existingRoute });
    } catch (error) {
        console.error("Error updating route:", error);
        res.status(500).json({ message: "An error occurred while updating the route" });
    }
});

// Delete Route
app.delete("/api/admin/routes/:id", authenticateAdmin, async (req, res) => {
    try {
        const routeId = req.params.id;
        const deletedRoute = await Route.findByIdAndDelete(routeId);
        if (!deletedRoute) {
            return res.status(404).json({ message: "Route not found" });
        }
        res.json({ message: "Route deleted successfully" });
    } catch (error) {
        console.error("Error deleting route:", error);
        res.status(500).json({ message: "An error occurred while deleting the route" });
    }
});

// Get Buses and Their Routes
app.get("/api/admin/buses-and-routes", authenticateAdmin, async (req, res) => {
    try {
        // Fetch all routes and populate the busNumber field to get bus details
        const routes = await Route.find().populate({
            path: 'busNumber',
            model: 'Driver' // Specify the model to use for population
        });

        // Organize the data
        const busesAndRoutes = routes.map(route => {
            if (!route.busNumber) {
                return null;
            }
            return {
                busNumber: route.busNumber.busNumber,
                driverUsername: route.busNumber.username,
                routeName: route.routeName,
                stops: route.stops,
                startTimeMorning: route.startTimeMorning,
            };
        }).filter(item => item !== null);

        res.json(busesAndRoutes);
    } catch (error) {
        console.error("Error fetching buses and routes:", error);
        res.status(500).json({ message: "An error occurred while fetching buses and routes" });
    }
});

// Start Server
const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Server running on port ${port}`));
