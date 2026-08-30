Feature: Worked example 02 - accounts

  Background:
    Given the database is empty
    And the shared database was built once

  @REQ-EC-013
  Scenario: Creating a user
    When I create a user named "Ada"
    Then the database has 1 user

  @REQ-EC-019
  Scenario: The shared database is built once
    When the account scenario reads the shared build ordinal
    Then the observed shared build ordinal is 1

  @skip
  Scenario: Deleting a missing user
    When I delete a user named "Ghost"
    Then the operation fails with "not found"

  @wip
  Scenario: Renaming a user
    When I rename a user
    Then nothing happens yet

  @REQ-EC-020
  Scenario: An hour passes for one account check
    When the account check waits an hour
    Then the account check clock reads 3600000

  Scenario: The next account check starts at zero
    When the next account check reads the clock
    Then the account check clock reads 0

  Scenario: Clearing the database removes rows written in this same scenario
    When this scenario writes "Turing" and then clears the database
    Then the database holds 0 accounts

  @REQ-EC-021 @slow
  Scenario: Every tag on this Scenario reaches the runner
    When this scenario adds a second account named "Grace"
    Then the account total across both scenarios is 1
