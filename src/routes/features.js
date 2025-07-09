// File: /flowmatic-r2c/src/routes/features.js
// Purpose: Feature toggle management endpoints
// Created: 2025-07-10
// Phase: 4 - Advanced Features

const express = require('express');
const router = express.Router();
const { 
    getAllFeatures, 
    getFeaturesByCategory, 
    setFeature, 
    isEnabled 
} = require('../config/features');

// GET /api/features - Get all feature toggles
router.get('/', (req, res) => {
    res.json({
        success: true,
        features: getAllFeatures(),
        categorized: getFeaturesByCategory()
    });
});

// GET /api/features/category - Get features by category
router.get('/category', (req, res) => {
    res.json({
        success: true,
        features: getFeaturesByCategory()
    });
});

// GET /api/features/:name - Check if specific feature is enabled
router.get('/:name', (req, res) => {
    const featureName = req.params.name.toUpperCase();
    const features = getAllFeatures();
    
    if (!(featureName in features)) {
        return res.status(404).json({
            success: false,
            error: 'Feature not found',
            feature: featureName
        });
    }
    
    res.json({
        success: true,
        feature: featureName,
        enabled: features[featureName],
        type: typeof features[featureName]
    });
});

// PUT /api/features/:name - Toggle or set a feature (admin only)
router.put('/:name', (req, res) => {
    const featureName = req.params.name.toUpperCase();
    const { value } = req.body;
    
    // In production, add authentication check here
    // if (!req.user || !req.user.isAdmin) {
    //     return res.status(403).json({ error: 'Admin access required' });
    // }
    
    const success = setFeature(featureName, value);
    
    if (!success) {
        return res.status(404).json({
            success: false,
            error: 'Feature not found',
            feature: featureName
        });
    }
    
    res.json({
        success: true,
        feature: featureName,
        value: value,
        message: `Feature ${featureName} updated`
    });
});

// Test endpoint
router.get('/test/status', (req, res) => {
    res.json({
        message: 'Features API working',
        endpoints: [
            'GET /api/features',
            'GET /api/features/category',
            'GET /api/features/:name',
            'PUT /api/features/:name'
        ],
        examples: {
            'Check if PARK is enabled': 'GET /api/features/ENABLE_PARK',
            'Disable TRANSFER': 'PUT /api/features/ENABLE_TRANSFER { "value": false }',
            'Set RECYCLE position': 'PUT /api/features/DEFAULT_RECYCLE_POSITION { "value": 5 }'
        }
    });
});

module.exports = router;