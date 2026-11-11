//! Go/no-go spike: a contract calls OutLayer, the enclave runs, and the result
//! comes back to this contract in a callback (NEAR yield/resume underneath).

use near_sdk::serde_json::{json, Value};
use near_sdk::{env, ext_contract, log, near, AccountId, Gas, PanicOnDefault, Promise, PromiseError};

const CALLBACK_GAS: Gas = Gas::from_tgas(15);
const OWN_GAS: Gas = Gas::from_tgas(10);

#[ext_contract(ext_outlayer)]
#[allow(dead_code)]
trait OutLayer {
    fn request_execution(
        &mut self,
        source: Value,
        resource_limits: Option<Value>,
        input_data: Option<String>,
        secrets_ref: Option<Value>,
        response_format: Option<String>,
        payer_account_id: Option<AccountId>,
        params: Option<Value>,
    );
}

#[near(serializers = [borsh, json])]
pub struct LastRun {
    pub input: String,
    /// The enclave's output as JSON text; `None` when the run failed.
    pub output: Option<String>,
    pub requested_at_ns: u64,
    pub answered_at_ns: u64,
    pub requested_block: u64,
    pub answered_block: u64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Spike {
    owner: AccountId,
    outlayer: AccountId,
    project_id: String,
    version_key: Option<String>,
    runs: u64,
    last: Option<LastRun>,
}

#[near]
impl Spike {
    #[init]
    pub fn new(outlayer: AccountId, project_id: String, version_key: Option<String>) -> Self {
        Self { owner: env::predecessor_account_id(), outlayer, project_id, version_key, runs: 0, last: None }
    }

    /// Pins the enclave build this contract runs.
    pub fn set_source(&mut self, project_id: String, version_key: Option<String>) {
        assert_eq!(env::predecessor_account_id(), self.owner, "owner only");
        self.project_id = project_id;
        self.version_key = version_key;
    }

    /// Runs the enclave with `input`. The attached NEAR pays OutLayer; what it
    /// does not use is refunded to the caller.
    #[payable]
    pub fn run(&mut self, input: String) -> Promise {
        let source = json!({ "Project": { "project_id": self.project_id, "version_key": self.version_key } });
        let limits = json!({ "max_instructions": 10_000_000_000u64, "max_memory_mb": 128, "max_execution_seconds": 60 });
        let gas = env::prepaid_gas().saturating_sub(CALLBACK_GAS).saturating_sub(OWN_GAS);
        ext_outlayer::ext(self.outlayer.clone())
            .with_attached_deposit(env::attached_deposit())
            .with_static_gas(gas)
            .request_execution(
                source,
                Some(limits),
                Some(input.clone()),
                None,
                Some("Json".into()),
                Some(env::predecessor_account_id()),
                None,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(CALLBACK_GAS)
                    .on_result(input, env::block_timestamp(), env::block_height()),
            )
    }

    #[private]
    pub fn on_result(
        &mut self,
        input: String,
        requested_at_ns: u64,
        requested_block: u64,
        #[callback_result] result: Result<Option<Value>, PromiseError>,
    ) -> Option<Value> {
        let output = result.ok().flatten();
        let run = LastRun {
            input,
            output: output.as_ref().map(Value::to_string),
            requested_at_ns,
            answered_at_ns: env::block_timestamp(),
            requested_block,
            answered_block: env::block_height(),
        };
        log!(
            "spike run {}: {} blocks, {} ms",
            self.runs + 1,
            run.answered_block - run.requested_block,
            (run.answered_at_ns - run.requested_at_ns) / 1_000_000
        );
        self.runs += 1;
        self.last = Some(run);
        output
    }

    pub fn last(&self) -> Option<&LastRun> {
        self.last.as_ref()
    }

    pub fn source(&self) -> Value {
        json!({ "project_id": self.project_id, "version_key": self.version_key, "runs": self.runs })
    }
}
