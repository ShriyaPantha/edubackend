const Organization = require("../model/organizationSchema");
const Subscription = require("../model/subscriptionSchema");

exports.getOrganizations = async (req, res) => {
  try {
    const organizations = await Organization.find();

    const data = await Promise.all(
      organizations.map(async (org) => {
        const subscription = await Subscription.findOne({
          schoolId: org.schoolId,
        }).populate("planId");

        return {
          ...org.toObject(),
          subscription,
        };
      })
    );

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};

exports.createOrganization = async (req, res) => {
  try {
    const org = await Organization.create(req.body);

    res.status(201).json({
      success: true,
      data: org,
    });
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};

exports.updateOrganization = async (req, res) => {
  try {
    const org = await Organization.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    res.json({
      success: true,
      data: org,
    });
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};

exports.deleteOrganization = async (req, res) => {
  try {
    await Organization.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Organization deleted",
    });
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};