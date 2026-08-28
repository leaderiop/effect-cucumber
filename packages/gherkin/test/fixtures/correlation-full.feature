@featuretag
Feature: correlation across every nesting level

  Background:
    Given a feature background step

  @ruletag
  Rule: a rule

    Background:
      Given a rule background step

    @scenariotag
    Scenario Outline: outline <name>
      When I use <name>
      Then it works

      @exampletag
      Examples:
        | name |
        | a    |
