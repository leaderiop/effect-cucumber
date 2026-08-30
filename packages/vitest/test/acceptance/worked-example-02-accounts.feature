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
