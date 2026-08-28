Feature: a zero-step scenario inside a Rule drops the Rule Background too

  Rule: a rule with a background

    Background:
      Given a rule background step

    Scenario: no steps
