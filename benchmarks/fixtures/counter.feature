Feature: Counter

  A minimal fixture authored fresh for this benchmark suite (ADR-EC-051). No existing acceptance
  fixture is this small, and reusing one would pull in effect-cucumber-specific machinery (shared
  World services, ParameterTypeStore) with no cucumber-js equivalent — defeating the point of a
  minimal-overhead baseline both runners implement from scratch.

  No tags on purpose: this fixture never needs vitest.tags.ts's declared tag universe touched.

  Scenario: Creating a counter
    Given a new counter bounded between 0 and 10
    Then the counter value is 0

  Scenario: Creating a counter twice is rejected
    Given a new counter bounded between 0 and 10
    When I create another counter bounded between 0 and 10
    Then the second creation is rejected with "counter already exists"

  Scenario: Incrementing the counter
    Given a new counter bounded between 0 and 10
    When I increment the counter by 3
    Then the counter value is 3

  Scenario: Decrementing the counter
    Given a new counter bounded between 0 and 10
    When I increment the counter by 5
    And I decrement the counter by 2
    Then the counter value is 3

  Scenario: Incrementing past the max bound is rejected
    Given a new counter bounded between 0 and 10
    When I increment the counter by 12
    Then the increment is rejected with "counter would exceed its max bound"

  Scenario: Decrementing past the min bound is rejected
    Given a new counter bounded between 0 and 10
    When I decrement the counter by 1
    Then the decrement is rejected with "counter would go below its min bound"
