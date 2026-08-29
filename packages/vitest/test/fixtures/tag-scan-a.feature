@fixture-alpha
Feature: a feature carrying tags at every nesting level

  Background:
    Given a background step

  @fixture-beta @fixture-gamma
  Rule: two tags on one line, above a Rule

    @fixture-delta
    Scenario Outline: outline <name>
      When I use <name>
      Then it works

      @fixture-epsilon
      Examples:
        | name |
        | a    |
