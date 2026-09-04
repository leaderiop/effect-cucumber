Feature: Timeout cascade fix under concurrent execution

  @timeout-100
  Scenario: the short timeout scenario survives a slow shared setup
    When nothing happens

  @timeout-2000
  Scenario: the long timeout scenario survives the same slow shared setup
    When nothing happens
