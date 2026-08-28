Feature: the same scenario name in two different Rule scopes stays legal

  Rule: one

    Scenario: happy path
      Given the first step

  Rule: two

    Scenario: happy path
      Given the second step
