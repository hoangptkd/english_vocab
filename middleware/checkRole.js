checkRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const User = require('../models/User');
        User.findById(req.user.id)
            .then(user => {
                if (!user) {
                    return res.status(404).json({ message: 'User not found' });
                }

                if (!roles.includes(user.role)) {
                    return res.status(403).json({
                        message: 'Access denied. Admin privileges required.'
                    });
                }

                next();
            })
            .catch(error => {
                res.status(500).json({ message: 'Server error', error: error.message });
            });
    };
};

module.exports = checkRole;