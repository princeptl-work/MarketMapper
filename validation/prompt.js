const joi = require("joi");
const ExpressError = require("../utils/errorHandler.js");
const promptSchema = joi.object({
      location: joi.string().required(),
      business: joi.string().required(),
});
module.exports = promptSchema;