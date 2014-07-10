barge = require '../src'
# barge = require '../lib'
# barge = require 'barge'

# Create a new Barge service named 'math'
math_service = new barge.Service 'math',

    # Define the math methods

    add: (n1, n2, cb) ->
        cb null, n1 + n2

    multiply: (n1, n2, cb) ->
        cb null, n1 * n2
