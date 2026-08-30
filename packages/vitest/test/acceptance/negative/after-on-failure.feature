Feature: an After hook runs when a step failed

  @REQ-EC-018
  Scenario: the scenario whose second step fails
    Given the parcel is accepted
    When the parcel is dropped
    Then the parcel is signed for
